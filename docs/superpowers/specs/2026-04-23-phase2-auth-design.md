# Phase 2 — Auth, Invitations, and Minimum Hardening

**Date:** 2026-04-23
**Project:** roy / invite-only AI chatbot
**Phase:** 2 of the host-aware implementation plan

## Context

Phase 1 shipped the real Next.js app shell with a Drizzle schema for `users`,
`invites`, and `auth_audit_logs`. Phase 2 makes the app private before any AI
features land. Auth comes first; the LLM is not exposed until this phase is
complete.

## Decisions

| Concern | Decision |
|---|---|
| Auth library | `bcryptjs` + `iron-session` |
| Sessions | DB-backed (`sessions` table) + encrypted cookie |
| Admin bootstrap | `instrumentation.ts` seed on empty DB |
| Invite flow | Link-only, registration after |
| Rate limiting | Redis sliding window, fail-open on Redis down |
| Route protection | Edge middleware (cookie check) + server layout (DB confirm) |
| Admin panel | Invites CRUD + user role management |
| Admin mutations | Next.js server actions with `revalidatePath` |

## Data Model

### New table: `sessions`

```sql
sessions
  id            text PRIMARY KEY   -- crypto.randomBytes(32).toString('hex')
  user_id       uuid FK users.id ON DELETE CASCADE NOT NULL
  expires_at    timestamptz NOT NULL
  ip_address    text
  user_agent    text
  created_at    timestamptz DEFAULT now() NOT NULL
```

Added to `apps/web/lib/db/schema.ts` alongside existing tables. A new Drizzle
migration is generated and committed.

### Existing tables used unchanged

- `users` — email, password_hash, display_name, role
- `invites` — code, email, role, status, expires_at, accepted_by_user_id, accepted_at, revoked_at
- `auth_audit_logs` — event, actor_user_id, target_user_id, invite_id, ip_address, user_agent, metadata

### Shared enum addition

`auth.logout` added to `authAuditEventValues` in `packages/shared/src/auth.ts`.

## Environment Variables

Added to the `web` service in `docker-compose.yml` (and `.env.example`):

```
AUTH_SECRET=      # 32-byte base64 secret: openssl rand -base64 32
REDIS_URL=        # redis://:${REDIS_PASSWORD}@redis:6379
ADMIN_EMAIL=      # first admin account email
ADMIN_PASSWORD=   # plaintext; instrumentation.ts hashes it with bcrypt (cost 12) at startup
```

## Admin Bootstrap

`apps/web/instrumentation.ts` runs once at Next.js server startup. If
`ADMIN_EMAIL` and `ADMIN_PASSWORD` are set and the `users` table is empty, it
hashes the password with bcrypt (cost 12) and inserts the admin row with
`role = 'admin'`. If the table already has rows it does nothing. This is the
only path to the first admin account; it is idempotent and safe to leave
enabled.

## Route Layout

```
app/
  (auth)/                   # public — no session required
    login/
      page.tsx
      actions.ts
    accept/[code]/
      page.tsx
      actions.ts
  (app)/                    # protected — session required
    layout.tsx              # DB session confirm + pass user context
    dashboard/
      page.tsx              # placeholder — real chat UI lands in Phase 3
    admin/                  # admin-only
      layout.tsx            # role check
      invites/
        page.tsx
        actions.ts
      users/
        page.tsx
        actions.ts
  api/
    auth/
      logout/
        route.ts
```

## Request Flow & Route Protection

### Middleware (`middleware.ts`, Edge runtime)

- Reads and decrypts the iron-session cookie
- If missing or expired: redirect to `/login`
- If valid: sets `x-user-id` and `x-user-role` request headers for downstream use
- Matcher excludes `/(auth)/*`, `/healthz`, `/_next/*`, and static assets
- No DB call — Edge-compatible
- The role header is advisory only; the DB check in admin layouts is authoritative
  (catches role changes that happened since the cookie was last issued)

### `(app)/layout.tsx` (Node runtime)

- Calls `requireSession()`:
  - Reads headers set by middleware
  - Queries `sessions` table to confirm the row still exists (catches revocations
    and role changes that happened since the cookie was issued)
  - If row is gone: clears cookie, redirects to `/login`
- Passes `{ user, session }` to child layouts via a cached server helper

### `(app)/admin/layout.tsx`

- Calls `requireAdmin()` — same as `requireSession()` but asserts `role === 'admin'`
- Returns 403 if the user is authenticated but not an admin

### Logout

- Server action triggered by a form button in the app layout
- Deletes the session row, clears the iron-session cookie, redirects to `/login`
- Audit logs `auth.logout`
- Using a server action (not a route handler) gives automatic CSRF protection via Next.js

## Auth Flows

### Login (`/login`)

1. Rate check: 5 attempts per IP per 15 minutes via Redis sliding window. Reject
   with 429 if exceeded.
2. Look up user by email. If not found: run a dummy `bcrypt.hash` to prevent
   timing-based email enumeration, return generic error.
3. `bcrypt.compare(password, user.passwordHash)`. On mismatch: increment rate
   limit counter, return generic "Invalid email or password".
4. Create `sessions` row. Set iron-session cookie (`HttpOnly`, `Secure`,
   `SameSite=Lax`, 30-day expiry). Cookie payload: `{ sessionId, userId, role,
   expiresAt }`.
5. Audit log `auth.login_succeeded` or `auth.login_failed` with IP and user agent.
6. Redirect to `/dashboard`.

### Invite + Registration (`/accept/[code]`)

1. Page load: look up invite by code. If not found, already accepted, revoked, or
   expired — show a static error page. The registration form is never rendered.
2. Rate check on form submission: 10 attempts per IP per hour.
3. User submits email, password, display name. If the invite has a target email,
   the submitted email must match (case-insensitive). If no target email, any
   valid email is accepted.
4. Check the submitted email is not already taken.
5. Hash password with `bcrypt` at cost factor 12.
6. In a single transaction:
   - Insert `users` row (`role` from invite, default `member`)
   - Update invite: `status → accepted`, `accepted_by_user_id`, `accepted_at`
7. Create `sessions` row. Set cookie.
8. Audit log `user.created` + `invite.accepted`.
9. Redirect to `/dashboard`.

## Rate Limiting (`lib/rate-limit.ts`)

Redis sorted set per key (`rate_limit:<action>:<ip>`), scored by Unix timestamp
in milliseconds.

On each call:
1. `ZREMRANGEBYSCORE` to drop entries older than the window
2. `ZCARD` to count remaining entries
3. If count ≥ limit: return `{ allowed: false, remaining: 0, resetAt }`
4. `ZADD` to record the current attempt
5. `EXPIRE` to auto-clean the key after the window passes

On Redis connection failure: log a warning, return `{ allowed: true }` — a
broken Redis must not lock users out.

## Admin Panel

### Invite management (`/admin/invites`)

- Table: code (truncated), target email, role, status, expires at, created at
- Create invite form: optional target email, role selector, expiry (7 days
  default). On submit:
  - Generate code: `crypto.randomBytes(32).toString('hex')`
  - Insert invite row with `status: pending`
  - Display full accept URL in a copyable field
  - Audit log `invite.created`
- Revoke action (pending invites only): set `status → revoked`, `revoked_at`,
  audit log `invite.revoked`

### User management (`/admin/users`)

- Table: email, display name, role, created at
- Role toggle (member ↔ admin) via server action:
  - Updates `users.role`
  - Audit logs `user.role_changed` with `actor_user_id` and `target_user_id`
- No user deletion in Phase 2 (downstream FK implications require conversation
  tables that don't exist yet)

All mutations are Next.js server actions. Each calls `revalidatePath` on the
relevant admin route after completing.

## Error Handling

- Auth errors (wrong password, expired invite, rate limit exceeded) are returned
  as typed error states from server actions — no exceptions surfaced to users.
- DB errors in server actions: catch, log to stderr, return generic "Something
  went wrong, try again". No internal details in the response.
- Redis unavailable in rate limiter: fail open with a `console.warn`. A broken
  Redis must not block legitimate logins.
- Session DB lookup failure: redirect to `/login` with a `?error=session`
  param.

## Testing

Three integration flows tested against a real Postgres instance (the compose
Postgres service or a test instance):

1. **Admin bootstrap** — empty DB → instrumentation runs → admin row inserted
   with correct role; re-run → no duplicate.
2. **Invite + registration** — create invite → visit accept URL → register →
   user row exists, session created, invite `status = accepted`, audit log
   written.
3. **Login** — valid credentials → session row created, cookie set; invalid
   credentials → `auth.login_failed` audit log, rate limit counter incremented.

Rate limiter unit-tested separately against Redis: sliding window allows up to
the limit then blocks, resets after the window.

No unit tests for UI components in Phase 2 — surfaces are still thin and will
change substantially in Phase 3.

## Phase Boundary

Phase 2 is complete when:
- Admin can log in and create an invite
- An invited user can register and log in
- Unauthenticated users cannot reach any `(app)/*` route
- Admin-only routes return 403 to authenticated non-admins
- Rate limiting is active on `/login` and `/accept/[code]`
- All auth events are written to `auth_audit_logs`

Phase 3 (streaming chat against Ollama) does not start until all exit criteria
above are met.

## Non-goals for this phase

- Email sending (invites are link-only)
- OAuth / social login
- Password reset flow
- Session list / active session management UI
- Audit log UI (query the table directly for now)
- User deletion

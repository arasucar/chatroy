# Terminal Protocol UI Redesign — Implementation Plan

**Date:** 2026-04-28  
**Design source:** `~/Downloads/stitch_chatroy_local_first_ai_assistant/`  
**Aesthetic:** Cyber-minimalism · Deep slate · Indigo primary · Inter + Space Grotesk · 0px radius · No shadows

---

## Design System Summary

The Terminal Protocol design system replaces the warm beige/serif aesthetic with:

| Token | Value |
|-------|-------|
| Background | `#0b1326` (surface) / `#060e20` (deepest) |
| Primary | `#c0c1ff` (muted indigo glow) |
| CTA | `#494bd6` (indigo-600 equivalent) |
| On-surface | `#dae2fd` |
| Outline | `#908fa0` (muted) / `#464554` (variant) |
| Tertiary | `#ffb783` (warm amber accent) |
| Error | `#ffb4ab` |
| Body font | Inter 400/500/600 |
| Mono/label font | Space Grotesk 400/500/700 |
| Border radius | 0px everywhere |
| Elevation | Tonal layering only, no box-shadow or blur |

Scrollbar: 4px, dark track. Status dots: square, not circle.

---

## Phases

### ✅ Phase 0 — Design tokens (`globals.css`)

**File:** `apps/web/app/globals.css`

Complete rewrite. All Terminal Protocol CSS custom properties (`--tp-*`) and utility class system:

- `tp-topbar` / `tp-wordmark` / `tp-nav-link` — shell navigation
- `tp-btn` + modifiers (`tp-btn-primary`, `tp-btn-ghost`, `tp-btn-danger`, `tp-btn-sm`)
- `tp-input`, `tp-select`, `tp-field`, `tp-field-label`
- `tp-chip`, `tp-chip-dot` — status indicator
- `tp-section` — bordered content container
- `tp-table`, `tp-badge` — data display
- `tp-error-msg`, `tp-success-msg` — notification banners
- `tp-page`, `tp-page-title`, `tp-page-sub` — content page wrapper
- `admin-tabnav`, `admin-tab` — admin sub-navigation
- `tp-danger-zone`
- Full `chat-*` class system restyled (same names, new dark styles)

---

### ✅ Phase 1 — Root layout + Google Fonts

**File:** `apps/web/app/layout.tsx`

- Added `<link>` for Inter + Space Grotesk from Google Fonts
- Updated metadata title to "CHATROY"

---

### ✅ Phase 2 — App layout (top bar)

**File:** `apps/web/app/(app)/layout.tsx`

Replace inline-styled nav with Terminal Protocol top bar.

Create `TopBarClient` client component (in same file or `top-bar.tsx`) using `usePathname` for active nav state. Server layout passes `userEmail` and `isAdmin`.

Structure:
```
<header class="tp-topbar">
  <div style="display:flex; align-items:center; gap:24px">
    <span class="tp-wordmark">CHATROY</span>
    <nav class="tp-topbar-nav">
      <a href="/dashboard" class="tp-nav-link [active]">Threads</a>
      <a href="/admin/scripts" class="tp-nav-link [active]">Admin</a>  {/* isAdmin only */}
      <a href="/settings" class="tp-nav-link [active]">Settings</a>
    </nav>
  </div>
  <div class="tp-topbar-end">
    <span class="tp-user-email">{email}</span>
    <form action={logoutAction}>
      <button class="tp-btn tp-btn-ghost tp-btn-sm">Sign out</button>
    </form>
  </div>
</header>
<div style="padding-top: 48px; min-height: 100vh">
  {children}
</div>
```

---

### ✅ Phase 3 — Login page

**File:** `apps/web/app/(auth)/login/page.tsx`

Replace inline styles with Terminal Protocol auth screen.

Structure:
```
<div style="min-height:100vh; background: var(--tp-surface-lowest)">
  {/* Minimal top bar with wordmark only */}
  <header class="tp-topbar">
    <span class="tp-wordmark">CHATROY</span>
    <span class="tp-mono">Local Engine</span>
  </header>

  {/* Centered card */}
  <main style="display:flex; align-items:center; justify-content:center; min-height:calc(100vh - 48px)">
    <div style="width:100%; max-width:400px; border:1px solid var(--tp-outline-var); position:relative; padding:32px; background:var(--tp-surface-lowest)">
      {/* 2px primary accent line at top */}
      <div style="position:absolute; top:0; left:0; right:0; height:2px; background:var(--tp-primary)"/>

      <h1 style="font-size:22px; font-weight:600; letter-spacing:-0.02em; margin:0 0 4px">Authenticate</h1>
      <p class="tp-mono" style="margin:0 0 24px">Access the local engine via secure protocol.</p>

      <form>
        <div class="tp-field">
          <label class="tp-field-label">Identity_Email</label>
          <input class="tp-input" type="email" name="email" placeholder="user@internal" />
        </div>
        <div class="tp-field" style="margin-top:16px">
          <label class="tp-field-label">Access_Key</label>
          <input class="tp-input" type="password" name="password" placeholder="••••••••••" />
        </div>
        <button class="tp-btn tp-btn-primary" style="width:100%; margin-top:24px; padding:12px">
          Establish Connection
        </button>
      </form>

      {/* Footer */}
      <div style="margin-top:32px; padding-top:16px; border-top:1px solid var(--tp-outline-var); display:flex; justify-content:space-between; align-items:center">
        <div class="tp-chip"><div class="tp-chip-dot"/>Local Engine Online</div>
        <span class="tp-mono">0.0.0.0:11434</span>
      </div>
    </div>
  </main>
</div>
```

Error messages: `<p class="tp-error-msg">...</p>` replacing inline color styles.

---

### ✅ Phase 4 — Chat workspace

**Files:** `apps/web/app/(app)/dashboard/chat-workspace.tsx`, `dashboard/page.tsx`

All state/logic stays identical. Only JSX structure + class names change.

**dashboard/page.tsx:** Remove `<main className="chat-shell">` wrapper — ChatWorkspace owns its layout.

**chat-workspace.tsx outer structure:**
```jsx
<div className="chat-shell">
  {/* LEFT SIDEBAR */}
  <aside className="chat-sidebar">
    <button className="chat-sidebar-new-btn" onClick={startNewConversation}>+ New Chat</button>

    <p className="chat-section-label">Recent Threads</p>
    <div className="chat-conversation-list">
      {conversations.map(...)}  {/* chat-conversation-item [is-active] */}
    </div>

    {/* KB section at bottom */}
    <div className="chat-sidebar-footer">
      <p className="chat-section-label">Knowledge Base</p>
      <label style="display:flex; align-items:center; justify-content:space-between">
        <span className="tp-mono">Use docs</span>
        <input type="checkbox" checked={useRetrieval} ... />
      </label>
      {/* document list if any */}
    </div>
  </aside>

  {/* MAIN CHAT */}
  <main className="chat-panel">
    {/* Messages */}
    <div className="chat-message-list">
      <div className="chat-message-inner">
        {messages.length === 0 ? (
          <div className="chat-empty-state">...</div>
        ) : (
          messages.map(msg => (
            <article className={`chat-message ${msg.role === 'assistant' ? 'chat-message-assistant' : ''}`}>
              <div className="chat-message-meta">
                <div className={`chat-avatar ${msg.role === 'user' ? 'chat-avatar-user' : 'chat-avatar-sys'}`}>
                  {msg.role === 'user' ? 'USR' : 'SYS'}
                </div>
                <span className="chat-message-timestamp">{formatTimestamp(msg.createdAt)}</span>
                {msg.model && <span className="tp-mono">{msg.model}</span>}
              </div>
              <div className="chat-message-body">
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              </div>
              {/* citations */}
            </article>
          ))
        )}
      </div>
    </div>

    {/* Input area */}
    <div className="chat-input-area">
      {error && <p className="chat-error">{error}</p>}
      {stepUpRequest && <div className="chat-stepup">...</div>}
      <div className="chat-input-inner">
        <div className="tp-chip" style="margin-bottom:8px">
          <div className="tp-chip-dot"/>
          <span>{modelLabel}</span>
        </div>
        <div className="chat-input-box">
          <textarea className="chat-input" ... />
          <button className="chat-send-btn">↑</button>
        </div>
        <p className="chat-footer-note">{statusNote}</p>
      </div>
    </div>
  </main>
</div>
```

---

### ✅ Phase 5 — Settings page

**Files:** `apps/web/app/(app)/settings/page.tsx`, `settings/openai-settings-form.tsx`

```jsx
{/* page.tsx */}
<div className="tp-page">
  <h1 className="tp-page-title">System Configuration</h1>
  <p className="tp-page-sub">Interface & API bridge · Remote provider management</p>

  <div className="tp-section">
    <h2 style="...">OpenAI Bridge</h2>
    <OpenAISettingsForm ... />
  </div>
</div>
```

Form controls: `tp-field` + `tp-field-label` + `tp-input`/`tp-select`.  
Buttons: `tp-btn tp-btn-primary` / `tp-btn tp-btn-ghost`.  
Feedback: `tp-error-msg` / `tp-success-msg`.

---

### ✅ Phase 6 — Admin layout + pages

**File:** `apps/web/app/(app)/admin/layout.tsx`

Create `AdminTabNav` client component with `usePathname` for active tab detection.

```jsx
<div>
  <nav className="admin-tabnav">
    <a href="/admin/invites"   className={`admin-tab ${isActive('/admin/invites') ? 'active' : ''}`}>Invites</a>
    <a href="/admin/users"     className={`admin-tab ${...}`}>Users</a>
    <a href="/admin/documents" className={`admin-tab ${...}`}>Documents</a>
    <a href="/admin/scripts"   className={`admin-tab ${...}`}>Scripts</a>
    <a href="/admin/runs"      className={`admin-tab ${...}`}>Runs</a>
  </nav>
  <div style="padding: 32px 40px">{children}</div>
</div>
```

**scripts/page.tsx:** Replace inline table with `tp-table`. Status badges: `tp-badge tp-badge-ok/warn/error`. CreateScriptForm: `tp-field` + `tp-input` + `tp-btn-primary`.

**Continuation completed:** Remaining admin surfaces were also migrated to Terminal Protocol primitives:
- Invites list, create invite form, and revoke action
- Users table and role/search action buttons
- Documents upload form and indexed document table
- Mediator runs table
- Script detail, manual run form, and recent run log
- Invite acceptance and registration screens

---

### ⏳ Phase 7 — Commit

Commit Sprint 3 files (T3-1 through T3-7) together with UI redesign as two separate commits:
1. `feat(sprint-3): algorithm hardening — paragraph chunking, eventsource-parser, SQL threshold, cost table`
2. `feat(ui): apply Terminal Protocol design system`

---

## Design critique notes (from Stitch review)

- ❌ Removed: "ZERO-KNOWLEDGE" / "ENCRYPTED TUNNEL ACTIVE" — inaccurate security marketing copy
- ❌ Removed: "Encrypted Session" footer badge on login — misleading
- ✅ Fixed: Login footer uses "Local Engine Active" + actual port
- ⚠️  Admin script modal (in Stitch) is missing: script `name`, `description`, `requiresStepUp` fields — add these when redesigning CreateScriptForm
- ⚠️  "GPT-40" typo in settings dropdown (Stitch) → correct to "gpt-4o"
- ⚠️  Dual nav pattern (top bar + sidebar) avoided — top bar handles app-level nav, pages handle their own structure

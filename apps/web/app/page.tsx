import { appRoleValues, inviteStatusValues } from "@roy/shared";

const services = [
  {
    name: "Postgres + pgvector",
    detail: "Primary state for users, sessions, invites, conversations, mediator runs, and the document retrieval index.",
  },
  {
    name: "Redis",
    detail: "Now backing auth rate limiting; still available later for queueing and short-lived app primitives.",
  },
  {
    name: "Ollama",
    detail: "Project 1 is already verified end to end and now powers both local chat and local retrieval embeddings.",
  },
];

const nextUp = [
  "Project 3 now includes registry-backed manual script runs for admins.",
  "Next product frontier: the third classifier route and script selection from the registry.",
  "Next operational frontier: Phase 8 visibility, backups, and restore drills.",
];

export default function HomePage() {
  return (
    <main style={{ minHeight: "100vh", background: "var(--tp-surface-lowest)" }}>
      <header className="tp-topbar">
        <span className="tp-wordmark">CHATROY</span>
        <nav className="tp-topbar-nav" aria-label="Public">
          <a className="tp-nav-link" href="/login">Login</a>
          <a className="tp-nav-link" href="/dashboard">Threads</a>
          <a className="tp-nav-link" href="/settings">Settings</a>
        </nav>
      </header>

      <div style={{ padding: "80px 40px 40px", maxWidth: 1160 }}>
        <section style={{ marginBottom: 32 }}>
          <p className="tp-page-sub">CHATROY / Project 3 Started</p>
          <div className="tp-landing-grid">
            <div>
              <h1 className="tp-landing-title">Project 2 is done. Project 3 has started.</h1>
              <p className="tp-landing-lede">
                Invite-only auth, admin bootstrap, invite acceptance, role checks,
                rate limiting, authenticated local chat, persisted mediator
                runs, document ingestion, cited retrieval, explicit OpenAI
                fallback, and controlled web search are wired. The next product
                layer is the script registry, manual runner, and eventually
                script-aware routing.
              </p>
            </div>
            <div className="tp-section">
              <h2 className="tp-section-title">What This Proves</h2>
              <p>
                The app now has a real private chat surface, a deterministic
                mediator boundary, an admin-visible run log, cited retrieval,
                remote fallback, and controlled external search. The remaining
                work is deeper Project 3 capability and stronger operations, not
                missing Project 2 plumbing.
              </p>
              <div className="tp-badge-row">
                <span className="tp-badge">Invite-only</span>
                <span className="tp-badge">Local chat</span>
                <span className="tp-badge">Retrieval</span>
                <span className="tp-badge">Remote fallback</span>
                <span className="tp-badge">Cost tracking</span>
                <span className="tp-badge">Web search</span>
              </div>
            </div>
            <div className="tp-action-grid">
              <a className="tp-action-pill" href="/login">
                <strong>/login</strong>
                <span>enter the private app</span>
              </a>
              <a className="tp-action-pill" href="/dashboard">
                <strong>/dashboard</strong>
                <span>chat with local retrieval enabled</span>
              </a>
              <a className="tp-action-pill" href="/admin/documents">
                <strong>/admin/documents</strong>
                <span>upload retrievable docs</span>
              </a>
              <a className="tp-action-pill" href="/settings">
                <strong>/settings</strong>
                <span>save your remote API key</span>
              </a>
              <a className="tp-action-pill" href="/admin/scripts">
                <strong>/admin/scripts</strong>
                <span>register script metadata</span>
              </a>
              <a className="tp-action-pill" href="/healthz">
                <strong>/healthz</strong>
                <span>container health probe</span>
              </a>
            </div>
          </div>
        </section>

        <section className="tp-card-grid">
          <article className="tp-section">
            <h2 className="tp-section-title">Compose Services Already Wired</h2>
            <ol className="tp-list">
              {services.map((service) => (
                <li key={service.name}>
                  <strong>{service.name}</strong>
                  <br />
                  {service.detail}
                </li>
              ))}
            </ol>
          </article>

          <article className="tp-section">
            <h2 className="tp-section-title">Immediate Next Work</h2>
            <ol className="tp-list">
              {nextUp.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </article>
        </section>

        <section className="tp-card-grid">
          <article className="tp-section">
            <h3 className="tp-section-title">Deployment Path</h3>
            <p>
              The same fresh-host and live-host overlays continue to work. Project 1
              already exposes a localhost streaming endpoint, while the web app now
              owns the authenticated product surface.
            </p>
          </article>

          <article className="tp-section">
            <h3 className="tp-section-title">Current Boundary</h3>
            <p>
              Project 2 scope is in place and Project 3 has begun with script
              registry authoring plus manual admin runs. What does not exist yet
              is the `script` classifier route or model-driven script selection.
            </p>
          </article>
        </section>

        <section className="tp-card-grid">
          <article className="tp-section">
            <h2 className="tp-section-title">Data Model Carried Into Project 3</h2>
            <p>
              Drizzle now defines the private app boundary end to end: users,
              sessions, invites, conversations, messages, auth audit logs,
              mediator runs, documents, document chunks, and encrypted per-user
              provider keys. Project 3 now adds both the script registry and
              persisted script run records for admin-triggered execution.
            </p>
            <div className="tp-badge-row">
              <span className="tp-badge">users</span>
              <span className="tp-badge">sessions</span>
              <span className="tp-badge">invites</span>
              <span className="tp-badge">conversations</span>
              <span className="tp-badge">messages</span>
              <span className="tp-badge">runs</span>
              <span className="tp-badge">documents</span>
              <span className="tp-badge">document_chunks</span>
              <span className="tp-badge">user_provider_keys</span>
              <span className="tp-badge">scripts</span>
              <span className="tp-badge">script_runs</span>
              <span className="tp-badge">auth_audit_logs</span>
            </div>
          </article>

          <article className="tp-section">
            <h2 className="tp-section-title">Shared Domain Constants</h2>
            <p>Roles and invite states now live in `packages/shared`.</p>
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <strong className="tp-field-label">Roles</strong>
                <div className="tp-badge-row">
                  {appRoleValues.map((role) => (
                    <span key={role} className="tp-badge">
                      {role}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <strong className="tp-field-label">Invite States</strong>
                <div className="tp-badge-row">
                  {inviteStatusValues.map((status) => (
                    <span key={status} className="tp-badge">
                      {status}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </article>
        </section>

        <p className="tp-page-sub" style={{ marginTop: 32 }}>
          If this page is up, Project 2 is complete and Project 3 has begun with
          the script registry plus manual admin-run execution layer.
        </p>
      </div>
    </main>
  );
}

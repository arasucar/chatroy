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
    <main className="shell">
      <div className="frame">
        <section className="hero">
          <p className="eyebrow">roy / project 3 started</p>
          <div className="hero-grid">
            <div className="hero-copy">
              <h1>Project 2 is done. Project 3 has started.</h1>
              <p className="lede">
                Invite-only auth, admin bootstrap, invite acceptance, role checks,
                rate limiting, authenticated local chat, persisted mediator
                runs, document ingestion, cited retrieval, explicit OpenAI
                fallback, and controlled web search are wired. The next product
                layer is the script registry, manual runner, and eventually
                script-aware routing.
              </p>
            </div>
            <div className="card">
              <h2>What this proves</h2>
              <p>
                The app now has a real private chat surface, a deterministic
                mediator boundary, an admin-visible run log, cited retrieval,
                remote fallback, and controlled external search. The remaining
                work is deeper Project 3 capability and stronger operations, not
                missing Project 2 plumbing.
              </p>
              <div className="badge-row">
                <span className="badge">Invite-only</span>
                <span className="badge">Local chat</span>
                <span className="badge">Retrieval</span>
                <span className="badge">Remote fallback</span>
                <span className="badge">Cost tracking</span>
                <span className="badge">Web search</span>
              </div>
            </div>
            <div className="hero-actions">
              <a className="pill" href="/login">
                <strong>/login</strong>
                <span>enter the private app</span>
              </a>
              <a className="pill" href="/dashboard">
                <strong>/dashboard</strong>
                <span>chat with local retrieval enabled</span>
              </a>
              <a className="pill" href="/admin/documents">
                <strong>/admin/documents</strong>
                <span>upload retrievable docs</span>
              </a>
              <a className="pill" href="/settings">
                <strong>/settings</strong>
                <span>save your remote API key</span>
              </a>
              <a className="pill" href="/admin/scripts">
                <strong>/admin/scripts</strong>
                <span>register script metadata</span>
              </a>
              <a className="pill" href="/healthz">
                <strong>/healthz</strong>
                <span>container health probe</span>
              </a>
            </div>
          </div>
        </section>

        <section className="status-grid">
          <article className="card">
            <h2>Compose services already wired</h2>
            <ol className="service-list">
              {services.map((service) => (
                <li key={service.name}>
                  <strong>{service.name}</strong>
                  <br />
                  {service.detail}
                </li>
              ))}
            </ol>
          </article>

          <article className="card">
            <h2>Immediate next work</h2>
            <ol className="todo-list">
              {nextUp.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </article>
        </section>

        <section className="detail-grid">
          <article className="card">
            <h3>Deployment path</h3>
            <p>
              The same fresh-host and live-host overlays continue to work. Project 1
              already exposes a localhost streaming endpoint, while the web app now
              owns the authenticated product surface.
            </p>
          </article>

          <article className="card">
            <h3>Current boundary</h3>
            <p>
              Project 2 scope is in place and Project 3 has begun with script
              registry authoring plus manual admin runs. What does not exist yet
              is the `script` classifier route or model-driven script selection.
            </p>
          </article>
        </section>

        <section className="status-grid">
          <article className="card">
            <h2>Data model carried into Project 3</h2>
            <p>
              Drizzle now defines the private app boundary end to end: users,
              sessions, invites, conversations, messages, auth audit logs,
              mediator runs, documents, document chunks, and encrypted per-user
              provider keys. Project 3 now adds both the script registry and
              persisted script run records for admin-triggered execution.
            </p>
            <div className="badge-row">
              <span className="badge">users</span>
              <span className="badge">sessions</span>
              <span className="badge">invites</span>
              <span className="badge">conversations</span>
              <span className="badge">messages</span>
              <span className="badge">runs</span>
              <span className="badge">documents</span>
              <span className="badge">document_chunks</span>
              <span className="badge">user_provider_keys</span>
              <span className="badge">scripts</span>
              <span className="badge">script_runs</span>
              <span className="badge">auth_audit_logs</span>
            </div>
          </article>

          <article className="card">
            <h2>Shared domain constants</h2>
            <p>Roles and invite states now live in `packages/shared`.</p>
            <div className="token-group">
              <div>
                <strong>Roles</strong>
                <div className="badge-row">
                  {appRoleValues.map((role) => (
                    <span key={role} className="badge">
                      {role}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <strong>Invite states</strong>
                <div className="badge-row">
                  {inviteStatusValues.map((status) => (
                    <span key={status} className="badge">
                      {status}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </article>
        </section>

        <p className="footnote">
          If this page is up, Project 2 is complete and Project 3 has begun with
          the script registry plus manual admin-run execution layer.
        </p>
      </div>
    </main>
  );
}

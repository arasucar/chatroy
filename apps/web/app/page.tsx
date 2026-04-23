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
  "Add web search as the next controlled external tool.",
  "Keep per-tool allowlists explicit instead of broadening access silently.",
  "Preserve the current two-route Project 2 classifier while extending tool visibility.",
];

export default function HomePage() {
  return (
    <main className="shell">
      <div className="frame">
        <section className="hero">
          <p className="eyebrow">roy / phase 6 provider-aware app</p>
          <div className="hero-grid">
            <div className="hero-copy">
              <h1>The private app is up. Remote fallback is live.</h1>
              <p className="lede">
                Invite-only auth, admin bootstrap, invite acceptance, role checks,
                rate limiting, authenticated local chat, persisted mediator
                runs, document ingestion, cited retrieval, and explicit OpenAI
                fallback are wired. The next boundary is controlled external tools.
              </p>
            </div>
            <div className="card">
              <h2>What this proves</h2>
              <p>
                The app now has a real private chat surface, a deterministic
                mediator boundary, an admin-visible run log, cited retrieval, and
                user-owned remote provider fallback with visible cost tracking.
              </p>
              <div className="badge-row">
                <span className="badge">Invite-only</span>
                <span className="badge">Local chat</span>
                <span className="badge">Retrieval</span>
                <span className="badge">Remote fallback</span>
                <span className="badge">Cost tracking</span>
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
              Auth, local chat, narrow mediation, retrieval, and OpenAI fallback
              are in place. What does not exist yet is broader external tool
              access such as web search.
            </p>
          </article>
        </section>

        <section className="status-grid">
          <article className="card">
            <h2>Data model carried into Phase 6</h2>
            <p>
              Drizzle now defines the private app boundary end to end: users,
              sessions, invites, conversations, messages, auth audit logs,
              mediator runs, documents, document chunks, and encrypted per-user
              provider keys. Those tables back the live app instead of placeholder
              scaffolding.
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
          If this page is up, the repo has moved past provider fallback plumbing
          and into controlled external tool work.
        </p>
      </div>
    </main>
  );
}

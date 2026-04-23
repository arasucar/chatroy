import { appRoleValues, inviteStatusValues } from "@roy/shared";

const services = [
  {
    name: "Postgres + pgvector",
    detail: "Primary state, users, conversations, and retrieval indexes will land here.",
  },
  {
    name: "Redis",
    detail: "Reserved for rate limiting, queueing, and short-lived session primitives.",
  },
  {
    name: "Ollama",
    detail: "Local model runtime stays on the compose network and remains the default provider.",
  },
];

const nextUp = [
  "Wire Auth.js and the invite-only admin bootstrap flow.",
  "Attach these typed tables to the first invite and user flows.",
  "Replace this shell with the authenticated chat and admin surfaces.",
];

export default function HomePage() {
  return (
    <main className="shell">
      <div className="frame">
        <section className="hero">
          <p className="eyebrow">roy / phase 1 shell</p>
          <div className="hero-grid">
            <div className="hero-copy">
              <h1>Infrastructure is live. The real app starts here.</h1>
              <p className="lede">
                This Next.js shell replaces the Phase 0 placeholder so the repo can
                move into real product work without changing the deployment shape.
                Auth, chat orchestration, and persistence still need to be wired.
              </p>
            </div>
            <div className="card">
              <h2>What this proves</h2>
              <p>
                The web service is now a real application build with a first-class
                health endpoint, ready to grow into the invite-only product.
              </p>
              <div className="badge-row">
                <span className="badge">App Router</span>
                <span className="badge">TypeScript</span>
                <span className="badge">Docker-ready</span>
              </div>
            </div>
            <div className="hero-actions">
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
              The same fresh-host and live-host overlays continue to work. Only
              the web build context changed from the static nginx placeholder to
              this app.
            </p>
          </article>

          <article className="card">
            <h3>Current boundary</h3>
            <p>
              This is still intentionally thin. The app now has a typed schema,
              migration tooling, and shared auth-domain constants, but there is
              still no login flow, invite acceptance, or model routing yet.
            </p>
          </article>
        </section>

        <section className="status-grid">
          <article className="card">
            <h2>Foundation added in Phase 1</h2>
            <p>
              Drizzle now defines the first app tables for users, invites, and
              auth audit logs. The schema is the contract for the next auth work,
              not a full feature by itself.
            </p>
            <div className="badge-row">
              <span className="badge">users</span>
              <span className="badge">invites</span>
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
          If this page is up, the repo has crossed from infrastructure-only into
          an actual application build target.
        </p>
      </div>
    </main>
  );
}

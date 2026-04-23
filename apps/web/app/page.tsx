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
  "Add a minimal database layer and migrations for the real app state.",
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
              This is intentionally thin. There is no auth, model routing, or
              database access yet, so the container remains easy to validate
              before the app starts taking on real responsibilities.
            </p>
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

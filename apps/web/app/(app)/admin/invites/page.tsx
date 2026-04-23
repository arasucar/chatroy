import { requireDb } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { CreateInviteForm } from "./create-invite-form";
import { RevokeButton } from "./revoke-button";

export default async function AdminInvitesPage() {
  const db = requireDb();
  const allInvites = await db.query.invites.findMany({
    orderBy: [desc(invites.createdAt)],
  });

  return (
    <main style={{ padding: "2rem", maxWidth: 800 }}>
      <h1 style={{ marginBottom: "2rem" }}>Invites</h1>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>Create invite</h2>
        <CreateInviteForm />
      </section>

      <section>
        <h2 style={{ marginBottom: "1rem", fontSize: "1.1rem" }}>All invites</h2>
        {allInvites.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No invites yet.</p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
                <th style={{ padding: "0.5rem" }}>Code</th>
                <th style={{ padding: "0.5rem" }}>Email</th>
                <th style={{ padding: "0.5rem" }}>Role</th>
                <th style={{ padding: "0.5rem" }}>Status</th>
                <th style={{ padding: "0.5rem" }}>Expires</th>
                <th style={{ padding: "0.5rem" }}></th>
              </tr>
            </thead>
            <tbody>
              {allInvites.map((inv) => (
                <tr key={inv.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem", fontFamily: "monospace" }}>{inv.code.slice(0, 8)}…</td>
                  <td style={{ padding: "0.5rem" }}>{inv.email ?? "—"}</td>
                  <td style={{ padding: "0.5rem" }}>{inv.role}</td>
                  <td style={{ padding: "0.5rem" }}>{inv.status}</td>
                  <td style={{ padding: "0.5rem" }}>{inv.expiresAt.toLocaleDateString()}</td>
                  <td style={{ padding: "0.5rem" }}>
                    {inv.status === "pending" && <RevokeButton inviteId={inv.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}

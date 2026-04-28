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
    <main>
      <h1 className="tp-page-title">Invite Control</h1>
      <p className="tp-page-sub">Access provisioning · Role assignment · Expiry policy</p>

      <section className="tp-section" style={{ marginBottom: 32, maxWidth: 640 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
          Create Invite
        </h2>
        <CreateInviteForm />
      </section>

      <section className="tp-section" style={{ maxWidth: 960 }}>
        <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 600 }}>
          All Invites
        </h2>
        {allInvites.length === 0 ? (
          <p className="tp-mono">No invites yet.</p>
        ) : (
          <table className="tp-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {allInvites.map((inv) => (
                <tr key={inv.id}>
                  <td className="tp-mono">{inv.code.slice(0, 8)}…</td>
                  <td>{inv.email ?? "—"}</td>
                  <td>
                    <span className={inv.role === "admin" ? "tp-badge tp-badge-warn" : "tp-badge"}>
                      {inv.role}
                    </span>
                  </td>
                  <td>
                    <span className={inv.status === "pending" ? "tp-badge tp-badge-ok" : "tp-badge tp-badge-error"}>
                      {inv.status}
                    </span>
                  </td>
                  <td>{inv.expiresAt.toLocaleDateString()}</td>
                  <td>
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

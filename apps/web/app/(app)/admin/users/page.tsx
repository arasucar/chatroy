import { requireDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { RoleToggle } from "./role-toggle";
import { SearchToggle } from "./search-toggle";
import { requireAdmin } from "@/lib/auth";

export default async function AdminUsersPage() {
  const adminResult = await requireAdmin();
  const { user: currentUser } = adminResult;

  const db = requireDb();
  const allUsers = await db.query.users.findMany({ orderBy: [asc(users.createdAt)] });

  return (
    <main>
      <h1 className="tp-page-title">User Directory</h1>
      <p className="tp-page-sub">Role governance · Search capability toggles</p>
      <section className="tp-section" style={{ maxWidth: 1080 }}>
        <table className="tp-table">
          <thead>
            <tr>
              <th>Email</th>
              <th>Display Name</th>
              <th>Role</th>
              <th>Search</th>
              <th>Joined</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {allUsers.map((u) => (
              <tr key={u.id}>
                <td>{u.email}</td>
                <td>{u.displayName ?? "—"}</td>
                <td>
                  <span className={u.role === "admin" ? "tp-badge tp-badge-warn" : "tp-badge"}>
                    {u.role}
                  </span>
                </td>
                <td>
                  <span className={u.searchEnabled ? "tp-badge tp-badge-ok" : "tp-badge"}>
                    {u.searchEnabled ? "On" : "Off"}
                  </span>
                </td>
                <td>{u.createdAt.toLocaleDateString()}</td>
                <td>
                  {u.id !== currentUser.id && (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <RoleToggle userId={u.id} currentRole={u.role} />
                      <SearchToggle userId={u.id} searchEnabled={u.searchEnabled} />
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

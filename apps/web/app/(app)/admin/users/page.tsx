import { redirect } from "next/navigation";
import { requireDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { RoleToggle } from "./role-toggle";
import { requireAdmin } from "@/lib/auth";

export default async function AdminUsersPage() {
  const adminResult = await requireAdmin();
  if (!adminResult) redirect("/dashboard");
  const { user: currentUser } = adminResult;

  const db = requireDb();
  const allUsers = await db.query.users.findMany({ orderBy: [asc(users.createdAt)] });

  return (
    <main style={{ padding: "2rem", maxWidth: 800 }}>
      <h1 style={{ marginBottom: "2rem" }}>Users</h1>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)" }}>
            <th style={{ padding: "0.5rem" }}>Email</th>
            <th style={{ padding: "0.5rem" }}>Display name</th>
            <th style={{ padding: "0.5rem" }}>Role</th>
            <th style={{ padding: "0.5rem" }}>Joined</th>
            <th style={{ padding: "0.5rem" }}></th>
          </tr>
        </thead>
        <tbody>
          {allUsers.map((u) => (
            <tr key={u.id} style={{ borderBottom: "1px solid var(--border)" }}>
              <td style={{ padding: "0.5rem" }}>{u.email}</td>
              <td style={{ padding: "0.5rem" }}>{u.displayName ?? "—"}</td>
              <td style={{ padding: "0.5rem" }}>{u.role}</td>
              <td style={{ padding: "0.5rem" }}>{u.createdAt.toLocaleDateString()}</td>
              <td style={{ padding: "0.5rem" }}>
                {u.id !== currentUser.id && (
                  <RoleToggle userId={u.id} currentRole={u.role} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}

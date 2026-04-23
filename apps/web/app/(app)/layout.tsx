import { redirect } from "next/navigation";
import { requireSession, deleteSession } from "@/lib/auth";
import { getSession } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";

async function logoutAction() {
  "use server";
  const cookie = await getSession();
  const userId = cookie.userId;
  await deleteSession();
  if (userId) {
    await writeAuditLog({ event: "auth.logout", actorUserId: userId });
  }
  redirect("/login");
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.75rem 1.5rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
      }}>
        <span style={{ fontWeight: 600 }}>roy</span>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <span style={{ color: "var(--muted)", fontSize: "0.875rem" }}>{user.email}</span>
          {user.role === "admin" && (
            <a href="/admin/invites" style={{ fontSize: "0.875rem" }}>Admin</a>
          )}
          <form action={logoutAction}>
            <button
              type="submit"
              style={{
                background: "none",
                border: "1px solid var(--border)",
                borderRadius: 4,
                padding: "0.25rem 0.75rem",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              Sign out
            </button>
          </form>
        </div>
      </nav>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  );
}

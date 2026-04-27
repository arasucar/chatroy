import { requireAdmin } from "@/lib/auth";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdmin();

  return (
    <div>
      <nav style={{
        padding: "0.5rem 1.5rem",
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-strong)",
        display: "flex",
        gap: "1.5rem",
        fontSize: "0.875rem",
      }}>
        <a href="/admin/invites">Invites</a>
        <a href="/admin/users">Users</a>
        <a href="/admin/documents">Documents</a>
        <a href="/admin/scripts">Scripts</a>
        <a href="/admin/runs">Runs</a>
      </nav>
      {children}
    </div>
  );
}

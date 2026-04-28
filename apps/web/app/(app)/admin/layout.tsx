import { requireAdmin } from "@/lib/auth";
import { AdminTabNav } from "./admin-tab-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div>
      <AdminTabNav />
      <div style={{ padding: "32px 40px" }}>{children}</div>
    </div>
  );
}

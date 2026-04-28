import { redirect } from "next/navigation";
import { requireSession, deleteSession } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { TopBarClient } from "./top-bar-client";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireSession();

  async function logoutAction() {
    "use server";
    await deleteSession();
    await writeAuditLog({ event: "auth.logout", actorUserId: user.id });
    redirect("/login");
  }

  return (
    <div style={{ minHeight: "100vh" }}>
      <TopBarClient
        userEmail={user.email}
        isAdmin={user.role === "admin"}
        logoutAction={logoutAction}
      />
      <div style={{ paddingTop: 48, minHeight: "100vh" }}>{children}</div>
    </div>
  );
}

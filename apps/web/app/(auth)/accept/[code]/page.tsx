import { and, eq, gt } from "drizzle-orm";
import { requireDb } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import { RegisterForm } from "./register-form";

interface Props {
  params: Promise<{ code: string }>;
}

export default async function AcceptPage({ params }: Props) {
  const { code } = await params;
  const db = requireDb();

  const invite = await db.query.invites.findFirst({
    where: and(
      eq(invites.code, code),
      eq(invites.status, "pending"),
      gt(invites.expiresAt, new Date()),
    ),
  });

  if (!invite) {
    return (
      <main className="tp-auth-shell">
        <div className="tp-auth-card" style={{ textAlign: "center" }}>
          <h1 className="tp-page-title">Invite Not Valid</h1>
          <p className="tp-page-sub" style={{ marginBottom: 0 }}>
            This invite link has expired, already been used, or doesn&apos;t exist.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="tp-auth-shell">
      <div className="tp-auth-card">
        <h1 className="tp-page-title">Create Your Account</h1>
        {invite.email && (
          <p className="tp-page-sub">
            This invite is for <strong>{invite.email}</strong>.
          </p>
        )}
        <RegisterForm code={code} targetEmail={invite.email ?? null} />
      </div>
    </main>
  );
}

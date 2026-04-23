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
      <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ maxWidth: 400, textAlign: "center", padding: "2rem" }}>
          <h1>Invite not valid</h1>
          <p style={{ color: "var(--muted)", marginTop: "0.5rem" }}>
            This invite link has expired, already been used, or doesn&apos;t exist.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: "100%", maxWidth: 400, padding: "2rem" }}>
        <h1 style={{ marginBottom: "0.5rem", fontSize: "1.5rem" }}>Create your account</h1>
        {invite.email && (
          <p style={{ color: "var(--muted)", marginBottom: "1.5rem" }}>
            This invite is for <strong>{invite.email}</strong>.
          </p>
        )}
        <RegisterForm code={code} targetEmail={invite.email ?? null} />
      </div>
    </main>
  );
}

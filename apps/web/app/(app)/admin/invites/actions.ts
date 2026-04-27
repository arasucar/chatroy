"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db";
import { invites } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import type { AppRole } from "@roy/shared";

export type CreateInviteState = { error?: string; inviteUrl?: string } | null;

export async function createInviteAction(
  _prevState: CreateInviteState,
  formData: FormData,
): Promise<CreateInviteState> {
  const admin = await requireAdmin();

  const email = ((formData.get("email") as string | null) ?? "").toLowerCase().trim() || null;
  const role = ((formData.get("role") as string | null) ?? "member") as AppRole;
  const expiryDays = Math.min(30, Math.max(1, Number(formData.get("expiryDays") ?? 7)));

  const db = requireDb();
  const code = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000);

  const [invite] = await db
    .insert(invites)
    .values({ code, email, role, expiresAt, createdByUserId: admin.user.id })
    .returning({ id: invites.id });

  await writeAuditLog({
    event: "invite.created",
    actorUserId: admin.user.id,
    inviteId: invite.id,
    metadata: { role, email, expiryDays },
  });

  revalidatePath("/admin/invites");

  const baseUrl = process.env.BASE_URL ?? "http://localhost:3000";
  return { inviteUrl: `${baseUrl}/accept/${code}` };
}

export async function revokeInviteAction(inviteId: string): Promise<void> {
  const admin = await requireAdmin();

  const db = requireDb();
  await db
    .update(invites)
    .set({ status: "revoked", revokedAt: new Date() })
    .where(eq(invites.id, inviteId));

  await writeAuditLog({ event: "invite.revoked", actorUserId: admin.user.id, inviteId });

  revalidatePath("/admin/invites");
}

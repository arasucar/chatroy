"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireAdmin } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import type { AppRole } from "@roy/shared";

export async function changeRoleAction(targetUserId: string, newRole: AppRole): Promise<void> {
  const admin = await requireAdmin();
  if (admin.user.id === targetUserId) return;

  const db = requireDb();
  await db.update(users).set({ role: newRole, updatedAt: new Date() }).where(eq(users.id, targetUserId));

  await writeAuditLog({
    event: "user.role_changed",
    actorUserId: admin.user.id,
    targetUserId,
    metadata: { newRole },
  });

  revalidatePath("/admin/users");
}

export async function setSearchEnabledAction(
  targetUserId: string,
  enabled: boolean,
): Promise<void> {
  const admin = await requireAdmin();

  const db = requireDb();
  await db
    .update(users)
    .set({ searchEnabled: enabled, updatedAt: new Date() })
    .where(eq(users.id, targetUserId));

  await writeAuditLog({
    event: "user.role_changed",
    actorUserId: admin.user.id,
    targetUserId,
    metadata: { searchEnabled: enabled, action: "search_access_changed" },
  });

  revalidatePath("/admin/users");
}

import { requireDb } from "./db";
import { authAuditLogs } from "./db/schema";
import type { AuthAuditEvent } from "@roy/shared";

interface AuditEntry {
  event: AuthAuditEvent;
  actorUserId?: string | null;
  targetUserId?: string | null;
  inviteId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function writeAuditLog(entry: AuditEntry): Promise<void> {
  try {
    const db = requireDb();
    await db.insert(authAuditLogs).values({
      event: entry.event,
      actorUserId: entry.actorUserId ?? null,
      targetUserId: entry.targetUserId ?? null,
      inviteId: entry.inviteId ?? null,
      ipAddress: entry.ipAddress ?? null,
      userAgent: entry.userAgent ?? null,
      metadata: entry.metadata ?? null,
    });
  } catch (err) {
    console.error("[audit] Failed to write audit log:", err);
    // Do not throw — audit failures must not block auth flows
  }
}

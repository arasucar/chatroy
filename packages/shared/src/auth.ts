export const appRoleValues = ["admin", "member"] as const;
export type AppRole = (typeof appRoleValues)[number];

export const inviteStatusValues = [
  "pending",
  "accepted",
  "revoked",
  "expired",
] as const;
export type InviteStatus = (typeof inviteStatusValues)[number];

export const authAuditEventValues = [
  "invite.created",
  "invite.accepted",
  "invite.revoked",
  "user.created",
  "user.role_changed",
  "auth.login_succeeded",
  "auth.login_failed",
] as const;
export type AuthAuditEvent = (typeof authAuditEventValues)[number];

import {
  boolean,
  customType,
  doublePrecision,
  integer,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  appRoleValues,
  authAuditEventValues,
  inviteStatusValues,
} from "@roy/shared";

export const appRole = pgEnum("app_role", appRoleValues);
export const inviteStatus = pgEnum("invite_status", inviteStatusValues);
export const authAuditEvent = pgEnum("auth_audit_event", authAuditEventValues);
export const chatMessageRole = pgEnum("chat_message_role", ["user", "assistant"]);
export const runRoute = pgEnum("run_route", ["chat", "escalate", "script"]);
export const runProvider = pgEnum("run_provider", ["local", "remote"]);
export const runStatus = pgEnum("run_status", [
  "started",
  "completed",
  "blocked",
  "failed",
]);
export const remoteProvider = pgEnum("remote_provider", ["openai"]);
export const scriptParamType = pgEnum("script_param_type", [
  "enum",
  "string",
  "number",
  "boolean",
]);
export const scriptRunStatus = pgEnum("script_run_status", [
  "started",
  "completed",
  "failed",
]);

const vector = customType<{
  data: number[];
  driverData: string;
  config: { dimensions: number };
}>({
  dataType(config) {
    return `vector(${config?.dimensions ?? 768})`;
  },
  toDriver(value) {
    return `[${value.join(",")}]`;
  },
  fromDriver(value) {
    return value
      .slice(1, -1)
      .split(",")
      .map((item) => Number.parseFloat(item));
  },
});

export type MessageCitation = {
  documentId: string;
  documentTitle: string;
  chunkId: string;
  chunkIndex: number;
  excerpt: string;
  score: number;
  source?: "retrieval" | "search";
  url?: string;
};

export type ScriptParamDefinition = {
  name: string;
  label: string;
  type: "enum" | "string" | "number" | "boolean";
  required: boolean;
  options?: string[];
  description?: string;
};

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    displayName: text("display_name"),
    role: appRole("role").notNull().default("member"),
    searchEnabled: boolean("search_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailUniqueIdx: uniqueIndex("users_email_unique_idx").on(table.email),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("sessions_user_id_idx").on(table.userId),
    expiresAtIdx: index("sessions_expires_at_idx").on(table.expiresAt),
  }),
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    email: text("email"),
    role: appRole("role").notNull().default("member"),
    status: inviteStatus("status").notNull().default("pending"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    codeUniqueIdx: uniqueIndex("invites_code_unique_idx").on(table.code),
    emailIdx: index("invites_email_idx").on(table.email),
    statusIdx: index("invites_status_idx").on(table.status),
  }),
);

export const authAuditLogs = pgTable(
  "auth_audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    event: authAuditEvent("event").notNull(),
    actorUserId: uuid("actor_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetUserId: uuid("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    inviteId: uuid("invite_id").references(() => invites.id, {
      onDelete: "set null",
    }),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    eventIdx: index("auth_audit_logs_event_idx").on(table.event),
    createdAtIdx: index("auth_audit_logs_created_at_idx").on(table.createdAt),
  }),
);

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    title: text("title").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("conversations_user_id_idx").on(table.userId),
    updatedAtIdx: index("conversations_updated_at_idx").on(table.updatedAt),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    role: chatMessageRole("role").notNull(),
    content: text("content").notNull(),
    model: text("model"),
    citations: jsonb("citations").$type<MessageCitation[] | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    conversationIdIdx: index("messages_conversation_id_idx").on(table.conversationId),
    createdAtIdx: index("messages_created_at_idx").on(table.createdAt),
  }),
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    sourceName: text("source_name"),
    mimeType: text("mime_type"),
    rawText: text("raw_text").notNull(),
    uploadedByUserId: uuid("uploaded_by_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uploadedByUserIdIdx: index("documents_uploaded_by_user_id_idx").on(table.uploadedByUserId),
    updatedAtIdx: index("documents_updated_at_idx").on(table.updatedAt),
  }),
);

export const documentChunks = pgTable(
  "document_chunks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    documentId: uuid("document_id")
      .references(() => documents.id, { onDelete: "cascade" })
      .notNull(),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    embedding: vector("embedding", { dimensions: 768 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    documentIdIdx: index("document_chunks_document_id_idx").on(table.documentId),
    chunkIndexIdx: uniqueIndex("document_chunks_document_id_chunk_index_idx").on(
      table.documentId,
      table.chunkIndex,
    ),
  }),
);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .references(() => conversations.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    route: runRoute("route").notNull(),
    provider: runProvider("provider").notNull(),
    status: runStatus("status").notNull().default("started"),
    model: text("model"),
    providerResponseId: text("provider_response_id"),
    decisionReason: text("decision_reason"),
    requestExcerpt: text("request_excerpt").notNull(),
    responseExcerpt: text("response_excerpt"),
    errorMessage: text("error_message"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    totalTokens: integer("total_tokens"),
    estimatedCostUsd: doublePrecision("estimated_cost_usd"),
    toolsUsed: jsonb("tools_used").$type<string[] | null>(),
    scriptId: uuid("script_id").references(() => scripts.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    conversationIdIdx: index("runs_conversation_id_idx").on(table.conversationId),
    userIdIdx: index("runs_user_id_idx").on(table.userId),
    createdAtIdx: index("runs_created_at_idx").on(table.createdAt),
    statusIdx: index("runs_status_idx").on(table.status),
    scriptIdIdx: index("runs_script_id_idx").on(table.scriptId),
  }),
);

export const userProviderKeys = pgTable(
  "user_provider_keys",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    provider: remoteProvider("provider").notNull(),
    encryptedApiKey: text("encrypted_api_key").notNull(),
    keyHint: text("key_hint").notNull(),
    defaultModel: text("default_model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userProviderUniqueIdx: uniqueIndex("user_provider_keys_user_provider_unique_idx").on(
      table.userId,
      table.provider,
    ),
    userIdIdx: index("user_provider_keys_user_id_idx").on(table.userId),
  }),
);

export const scripts = pgTable(
  "scripts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    command: text("command").notNull(),
    argvTemplate: jsonb("argv_template").$type<string[]>().notNull(),
    paramsSchema: jsonb("params_schema").$type<ScriptParamDefinition[]>().notNull(),
    enabled: boolean("enabled").notNull().default(true),
    requiresStepUp: boolean("requires_step_up").notNull().default(false),
    createdByUserId: uuid("created_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    nameUniqueIdx: uniqueIndex("scripts_name_unique_idx").on(table.name),
    enabledIdx: index("scripts_enabled_idx").on(table.enabled),
    createdByUserIdIdx: index("scripts_created_by_user_id_idx").on(table.createdByUserId),
  }),
);

export const scriptRuns = pgTable(
  "script_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scriptId: uuid("script_id")
      .references(() => scripts.id, { onDelete: "cascade" })
      .notNull(),
    invokedByUserId: uuid("invoked_by_user_id")
      .references(() => users.id, { onDelete: "set null" }),
    status: scriptRunStatus("status").notNull().default("started"),
    resolvedCommand: text("resolved_command").notNull(),
    resolvedArgv: jsonb("resolved_argv").$type<string[]>().notNull(),
    params: jsonb("params").$type<Record<string, string | number | boolean>>().notNull(),
    stdout: text("stdout"),
    stderr: text("stderr"),
    exitCode: integer("exit_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    scriptIdIdx: index("script_runs_script_id_idx").on(table.scriptId),
    invokedByUserIdIdx: index("script_runs_invoked_by_user_id_idx").on(table.invokedByUserId),
    createdAtIdx: index("script_runs_created_at_idx").on(table.createdAt),
  }),
);

export const schema = {
  users,
  sessions,
  invites,
  authAuditLogs,
  conversations,
  messages,
  runs,
  documents,
  documentChunks,
  userProviderKeys,
  scripts,
  scriptRuns,
};

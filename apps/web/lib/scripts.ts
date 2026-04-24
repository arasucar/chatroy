import { desc, eq } from "drizzle-orm";
import { execFile } from "node:child_process";
import { requireDb } from "./db";
import { scriptRuns, scripts, type ScriptParamDefinition } from "./db/schema";

export type ScriptRow = typeof scripts.$inferSelect;
export type ScriptRunRow = typeof scriptRuns.$inferSelect;

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }
  return trimmed;
}

function validateCommand(command: string): string {
  const trimmed = requireNonEmpty(command, "Command");
  if (!trimmed.startsWith("/")) {
    throw new Error("Command must be an absolute path.");
  }
  return trimmed;
}

function placeholderParam(token: string): string | null {
  const match = token.match(/^\{([a-zA-Z0-9_]+)\}$/);
  if (match) return match[1];
  if (token.includes("{") || token.includes("}")) {
    throw new Error("Argv template placeholders must occupy an entire argv token.");
  }
  return null;
}

export function parseArgvTemplate(raw: string): string[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Argv template must be a JSON array of strings.");
  }
  return parsed;
}

export function parseParamsSchema(raw: string): ScriptParamDefinition[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    throw new Error("Params schema must be a JSON array.");
  }

  return parsed.map((item, index) => {
    if (typeof item !== "object" || item === null) {
      throw new Error(`Param ${index + 1} must be an object.`);
    }

    const record = item as Record<string, unknown>;
    const type = record.type;
    const name = requireNonEmpty(String(record.name ?? ""), `Param ${index + 1} name`);
    const label = requireNonEmpty(String(record.label ?? name), `Param ${index + 1} label`);
    const required = Boolean(record.required);

    if (!["enum", "string", "number", "boolean"].includes(String(type))) {
      throw new Error(`Param ${name} has an invalid type.`);
    }

    const definition: ScriptParamDefinition = {
      name,
      label,
      type: type as ScriptParamDefinition["type"],
      required,
    };

    if (record.description) {
      definition.description = String(record.description);
    }

    if (type === "enum") {
      if (!Array.isArray(record.options) || record.options.some((option) => typeof option !== "string")) {
        throw new Error(`Enum param ${name} must define string options.`);
      }
      definition.options = record.options;
    }

    return definition;
  });
}

export async function listScripts(): Promise<ScriptRow[]> {
  const db = requireDb();
  return db.query.scripts.findMany({
    orderBy: [desc(scripts.updatedAt)],
  });
}

export async function listEnabledScripts(): Promise<ScriptRow[]> {
  const db = requireDb();
  return db.query.scripts.findMany({
    where: eq(scripts.enabled, true),
    orderBy: [desc(scripts.updatedAt)],
  });
}

export async function getScriptById(scriptId: string): Promise<ScriptRow | null> {
  const db = requireDb();
  return (await db.query.scripts.findFirst({ where: eq(scripts.id, scriptId) })) ?? null;
}

function assertScriptStructure(
  argvTemplate: string[],
  paramsSchema: ScriptParamDefinition[],
): void {
  const params = new Map(paramsSchema.map((param) => [param.name, param]));
  for (const token of argvTemplate) {
    const placeholder = placeholderParam(token);
    if (placeholder && !params.has(placeholder)) {
      throw new Error(`Argv template references unknown param: ${placeholder}`);
    }
  }
}

export async function createScript(input: {
  name: string;
  description?: string | null;
  command: string;
  argvTemplate: string[];
  paramsSchema: ScriptParamDefinition[];
  enabled: boolean;
  requiresStepUp: boolean;
  createdByUserId: string;
}): Promise<ScriptRow> {
  const db = requireDb();
  const now = new Date();
  const command = validateCommand(input.command);
  assertScriptStructure(input.argvTemplate, input.paramsSchema);
  const [script] = await db
    .insert(scripts)
    .values({
      name: input.name.trim(),
      description: input.description?.trim() || null,
      command,
      argvTemplate: input.argvTemplate,
      paramsSchema: input.paramsSchema,
      enabled: input.enabled,
      requiresStepUp: input.requiresStepUp,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return script;
}

export function resolveScriptParams(
  paramsSchema: ScriptParamDefinition[],
  rawValues: Record<string, FormDataEntryValue | null | undefined>,
): Record<string, string | number | boolean> {
  const result: Record<string, string | number | boolean> = {};

  for (const param of paramsSchema) {
    const raw = rawValues[param.name];

    if (param.type === "boolean") {
      const enabled = raw === "true" || raw === "on";
      if (param.required || enabled) result[param.name] = enabled;
      continue;
    }

    const stringValue = typeof raw === "string" ? raw.trim() : "";
    if (!stringValue) {
      if (param.required) throw new Error(`${param.label} is required.`);
      continue;
    }

    if (param.type === "enum") {
      if (!param.options?.includes(stringValue)) {
        throw new Error(`${param.label} must be one of: ${param.options?.join(", ")}`);
      }
      result[param.name] = stringValue;
      continue;
    }

    if (param.type === "number") {
      const parsed = Number(stringValue);
      if (!Number.isFinite(parsed)) {
        throw new Error(`${param.label} must be a valid number.`);
      }
      result[param.name] = parsed;
      continue;
    }

    result[param.name] = stringValue;
  }

  return result;
}

export function resolveScriptArgv(
  argvTemplate: string[],
  params: Record<string, string | number | boolean>,
): string[] {
  return argvTemplate.map((token) => {
    const placeholder = placeholderParam(token);
    if (!placeholder) return token;

    if (!(placeholder in params)) {
      throw new Error(`Missing required param for argv substitution: ${placeholder}`);
    }

    return String(params[placeholder]);
  });
}

export async function listScriptRuns(scriptId: string): Promise<ScriptRunRow[]> {
  const db = requireDb();
  return db.query.scriptRuns.findMany({
    where: eq(scriptRuns.scriptId, scriptId),
    orderBy: [desc(scriptRuns.createdAt)],
  });
}

export async function executeScript(input: {
  script: ScriptRow;
  params: Record<string, string | number | boolean>;
  invokedByUserId: string;
}): Promise<ScriptRunRow> {
  if (!input.script.enabled) {
    throw new Error("Script is disabled.");
  }

  const db = requireDb();
  const resolvedCommand = validateCommand(input.script.command);
  const resolvedArgv = resolveScriptArgv(input.script.argvTemplate, input.params);
  const now = new Date();

  const [run] = await db
    .insert(scriptRuns)
    .values({
      scriptId: input.script.id,
      invokedByUserId: input.invokedByUserId,
      status: "started",
      resolvedCommand,
      resolvedArgv,
      params: input.params,
      createdAt: now,
    })
    .returning();

  const result = await new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    status: "completed" | "failed";
  }>((resolve) => {
    execFile(
      resolvedCommand,
      resolvedArgv,
      {
        timeout: 10000,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (!error) {
          resolve({
            stdout,
            stderr,
            exitCode: 0,
            status: "completed",
          });
          return;
        }

        const maybeCode = (error as NodeJS.ErrnoException & { code?: number }).code;
        const exitCode =
          typeof maybeCode === "number"
            ? maybeCode
            : 1;

        resolve({
          stdout,
          stderr: stderr || error.message,
          exitCode,
          status: "failed",
        });
      },
    );
  });

  const [updatedRun] = await db
    .update(scriptRuns)
    .set({
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      completedAt: new Date(),
    })
    .where(eq(scriptRuns.id, run.id))
    .returning();

  return updatedRun;
}

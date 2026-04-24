import { beforeEach, describe, expect, it } from "vitest";
import { cleanDb, testDb } from "./setup";
import {
  createScript,
  listScripts,
  listScriptRuns,
  parseArgvTemplate,
  parseParamsSchema,
  resolveScriptArgv,
  resolveScriptParams,
} from "../lib/scripts";
import { schema } from "../lib/db/schema";

describe("script registry", () => {
  beforeEach(async () => {
    await cleanDb();
  });

  it("parses argv templates and enum-first param schemas", () => {
    const argv = parseArgvTemplate('["status","--env","{environment}"]');
    const params = parseParamsSchema(
      '[{"name":"environment","label":"Environment","type":"enum","required":true,"options":["dev","prod"]}]',
    );

    expect(argv).toEqual(["status", "--env", "{environment}"]);
    expect(params[0].type).toBe("enum");
    expect(params[0].options).toEqual(["dev", "prod"]);
  });

  it("stores scripts as data rows", async () => {
    const [user] = await testDb
      .insert(schema.users)
      .values({ email: "scripts@test.local", role: "admin" })
      .returning();

    await createScript({
      name: "service-status",
      description: "Check service status by environment.",
      command: "/usr/bin/systemctl",
      argvTemplate: ["status", "--env", "{environment}"],
      paramsSchema: [
        {
          name: "environment",
          label: "Environment",
          type: "enum",
          required: true,
          options: ["dev", "prod"],
        },
      ],
      enabled: true,
      requiresStepUp: true,
      createdByUserId: user.id,
    });

    const scripts = await listScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].name).toBe("service-status");
    expect(scripts[0].argvTemplate).toEqual(["status", "--env", "{environment}"]);
    expect(scripts[0].requiresStepUp).toBe(true);
  });

  it("resolves params and argv without shell interpolation", () => {
    const params = resolveScriptParams(
      [
        {
          name: "environment",
          label: "Environment",
          type: "enum",
          required: true,
          options: ["dev", "prod"],
        },
        {
          name: "verbose",
          label: "Verbose",
          type: "boolean",
          required: false,
        },
      ],
      {
        environment: "prod",
        verbose: "on",
      },
    );

    const argv = resolveScriptArgv(["status", "{environment}", "{verbose}"], params);
    expect(argv).toEqual(["status", "prod", "true"]);
  });

  it("records script runs through execFile", async () => {
    const [user] = await testDb
      .insert(schema.users)
      .values({ email: "script-run@test.local", role: "admin" })
      .returning();

    const script = await createScript({
      name: "echo-status",
      description: "Echo a status token",
      command: "/usr/bin/printf",
      argvTemplate: ["status:%s", "{environment}"],
      paramsSchema: [
        {
          name: "environment",
          label: "Environment",
          type: "enum",
          required: true,
          options: ["dev", "prod"],
        },
      ],
      enabled: true,
      requiresStepUp: false,
      createdByUserId: user.id,
    });

    const { executeScript } = await import("../lib/scripts");
    const run = await executeScript({
      script,
      params: { environment: "prod" },
      invokedByUserId: user.id,
    });

    expect(run.status).toBe("completed");
    expect(run.stdout).toContain("status:prod");

    const runs = await listScriptRuns(script.id);
    expect(runs).toHaveLength(1);
  });
});

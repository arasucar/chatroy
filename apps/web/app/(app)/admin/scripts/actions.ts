"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createScript, parseArgvTemplate, parseParamsSchema } from "@/lib/scripts";

export type CreateScriptState = { error?: string; success?: string } | null;

export async function createScriptAction(
  _prevState: CreateScriptState,
  formData: FormData,
): Promise<CreateScriptState> {
  const admin = await requireAdmin();

  const name = String(formData.get("name") ?? "");
  const description = String(formData.get("description") ?? "");
  const command = String(formData.get("command") ?? "");
  const argvTemplateRaw = String(formData.get("argvTemplate") ?? "[]");
  const paramsSchemaRaw = String(formData.get("paramsSchema") ?? "[]");
  const enabled = formData.get("enabled") === "on";
  const requiresStepUp = formData.get("requiresStepUp") === "on";

  try {
    const argvTemplate = parseArgvTemplate(argvTemplateRaw);
    const paramsSchema = parseParamsSchema(paramsSchemaRaw);

    await createScript({
      name,
      description,
      command,
      argvTemplate,
      paramsSchema,
      enabled,
      requiresStepUp,
      createdByUserId: admin.user.id,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to create script.",
    };
  }

  revalidatePath("/admin/scripts");

  return { success: "Script registered." };
}

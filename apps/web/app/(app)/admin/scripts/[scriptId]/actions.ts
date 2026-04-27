"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin, verifyStepUpPassword } from "@/lib/auth";
import { executeScript, getScriptById, resolveScriptParams } from "@/lib/scripts";

export type RunScriptState = { error?: string; success?: string } | null;

export async function runScriptAction(
  scriptId: string,
  _prevState: RunScriptState,
  formData: FormData,
): Promise<RunScriptState> {
  const admin = await requireAdmin();

  const script = await getScriptById(scriptId);
  if (!script) return { error: "Script not found." };

  try {
    if (script.requiresStepUp) {
      const verification = await verifyStepUpPassword(String(formData.get("password") ?? ""));
      if (!verification.ok) return { error: verification.error };
    }

    const params = resolveScriptParams(
      script.paramsSchema,
      Object.fromEntries(formData.entries()),
    );
    await executeScript({
      script,
      params,
      invokedByUserId: admin.user.id,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Script execution failed." };
  }

  revalidatePath(`/admin/scripts/${scriptId}`);

  return { success: "Script run recorded." };
}

"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { deleteUserProviderKey, upsertUserProviderKey } from "@/lib/user-provider-keys";
import { hasUserKeyEncryptionConfigured } from "@/lib/secrets";

export type SaveProviderState = { error?: string; success?: string } | null;

export async function saveOpenAISettingsAction(
  _prevState: SaveProviderState,
  formData: FormData,
): Promise<SaveProviderState> {
  const { user } = await requireSession();
  if (!hasUserKeyEncryptionConfigured()) {
    return { error: "Remote provider storage is not configured on the server yet." };
  }

  const apiKey = ((formData.get("apiKey") as string | null) ?? "").trim();
  const defaultModel = ((formData.get("defaultModel") as string | null) ?? "gpt-5-mini").trim();

  if (!apiKey.startsWith("sk-")) {
    return { error: "Enter a valid OpenAI API key." };
  }

  await upsertUserProviderKey({
    userId: user.id,
    provider: "openai",
    apiKey,
    defaultModel,
  });

  revalidatePath("/settings");

  return { success: "OpenAI key saved." };
}

export async function deleteOpenAISettingsAction(): Promise<void> {
  const { user } = await requireSession();
  await deleteUserProviderKey(user.id, "openai");
  revalidatePath("/settings");
}

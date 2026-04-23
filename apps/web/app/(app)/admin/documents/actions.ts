"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createDocumentWithEmbeddings } from "@/lib/retrieval";

export type CreateDocumentState = { error?: string; success?: string } | null;

export async function createDocumentAction(
  _prevState: CreateDocumentState,
  formData: FormData,
): Promise<CreateDocumentState> {
  const admin = await requireAdmin();
  if (!admin) return { error: "Unauthorized." };

  const title = ((formData.get("title") as string | null) ?? "").trim() || null;
  const rawText = ((formData.get("rawText") as string | null) ?? "").trim();
  const maybeFile = formData.get("file");
  const file = maybeFile instanceof File ? maybeFile : null;
  const fileText = file && file.size > 0 ? await file.text() : "";
  const sourceName = file?.name?.trim() || null;
  const mimeType = file?.type?.trim() || null;
  const text = (fileText || rawText).trim();

  if (!text) {
    return { error: "Provide either a text file or pasted document text." };
  }

  await createDocumentWithEmbeddings({
    title,
    sourceName,
    mimeType,
    rawText: text,
    uploadedByUserId: admin.user.id,
  });

  revalidatePath("/admin/documents");
  revalidatePath("/dashboard");

  return { success: "Document indexed for retrieval." };
}

import { eq, and } from "drizzle-orm";
import { requireDb } from "./db";
import { userProviderKeys } from "./db/schema";
import { decryptSecret, encryptSecret } from "./secrets";

export type UserProviderKeyRow = typeof userProviderKeys.$inferSelect;

export async function getUserProviderKey(
  userId: string,
  provider: "openai",
): Promise<UserProviderKeyRow | null> {
  const db = requireDb();
  return (
    (await db.query.userProviderKeys.findFirst({
      where: and(
        eq(userProviderKeys.userId, userId),
        eq(userProviderKeys.provider, provider),
      ),
    })) ?? null
  );
}

export async function getDecryptedUserProviderKey(
  userId: string,
  provider: "openai",
): Promise<(UserProviderKeyRow & { apiKey: string }) | null> {
  const stored = await getUserProviderKey(userId, provider);
  if (!stored) return null;

  return {
    ...stored,
    apiKey: decryptSecret(stored.encryptedApiKey),
  };
}

export async function upsertUserProviderKey(input: {
  userId: string;
  provider: "openai";
  apiKey: string;
  defaultModel: string;
}): Promise<void> {
  const db = requireDb();
  const now = new Date();
  await db
    .insert(userProviderKeys)
    .values({
      userId: input.userId,
      provider: input.provider,
      encryptedApiKey: encryptSecret(input.apiKey),
      keyHint: input.apiKey.slice(-4),
      defaultModel: input.defaultModel,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userProviderKeys.userId, userProviderKeys.provider],
      set: {
        encryptedApiKey: encryptSecret(input.apiKey),
        keyHint: input.apiKey.slice(-4),
        defaultModel: input.defaultModel,
        updatedAt: now,
      },
    });
}

export async function deleteUserProviderKey(
  userId: string,
  provider: "openai",
): Promise<void> {
  const db = requireDb();
  await db
    .delete(userProviderKeys)
    .where(
      and(
        eq(userProviderKeys.userId, userId),
        eq(userProviderKeys.provider, provider),
      ),
    );
}

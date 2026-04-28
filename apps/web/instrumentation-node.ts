export async function registerNodeInstrumentation() {
  await validateEmbeddingDimensions();
  await bootstrapAdminUser();
}

async function validateEmbeddingDimensions() {
  const { generateEmbeddings } = await import("./lib/provider");
  const { EMBEDDING_DIMENSIONS } = await import("./lib/retrieval");

  try {
    const [vec] = await generateEmbeddings({ texts: ["dim-check"] });
    if (!vec) return;
    if (vec.length !== EMBEDDING_DIMENSIONS) {
      console.error(
        `[startup] Embedding dimension mismatch: model returned ${vec.length}, expected ${EMBEDDING_DIMENSIONS}. ` +
        `Update EMBEDDING_DIMENSIONS in lib/retrieval.ts or switch to a ${EMBEDDING_DIMENSIONS}-d model.`,
      );
      process.exit(1);
    }
  } catch {
    // Ollama may not be reachable at startup in some environments; skip check
  }
}

async function bootstrapAdminUser() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) return;

  const { requireDb } = await import("./lib/db");
  const { users } = await import("./lib/db/schema");
  const bcrypt = await import("bcryptjs");

  const db = requireDb();
  const count = await db.$count(users);

  if (count > 0) return;

  const passwordHash = await bcrypt.hash(password, 12);
  await db
    .insert(users)
    .values({
      email,
      passwordHash,
      role: "admin",
      displayName: "Admin",
    })
    .onConflictDoNothing();

  console.log(`[bootstrap] Admin user created: ${email}`);
}

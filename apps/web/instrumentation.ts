export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

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
  await db.insert(users).values({
    email,
    passwordHash,
    role: "admin",
    displayName: "Admin",
  });

  console.log(`[bootstrap] Admin user created: ${email}`);
}

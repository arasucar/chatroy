/// <reference types="vitest/globals" />
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { schema } from "../lib/db/schema";

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://roy:change-me-openssl-rand-base64-32@127.0.0.1:15432/roy_test";

let sql: ReturnType<typeof postgres>;
export let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  // Create roy_test database if it doesn't exist
  const adminSql = postgres(TEST_DATABASE_URL.replace(/\/[^/]+$/, "/postgres"), {
    prepare: false,
    onnotice: () => {},
  });
  try {
    await adminSql`CREATE DATABASE roy_test`;
  } catch {
    // Already exists — fine
  }
  await adminSql.end();

  sql = postgres(TEST_DATABASE_URL, { prepare: false });
  testDb = drizzle(sql, { schema });
  await migrate(testDb, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  await sql?.end();
});

export async function cleanDb() {
  await testDb.delete(schema.userProviderKeys);
  await testDb.delete(schema.runs);
  await testDb.delete(schema.messages);
  await testDb.delete(schema.conversations);
  await testDb.delete(schema.documentChunks);
  await testDb.delete(schema.documents);
  await testDb.delete(schema.authAuditLogs);
  await testDb.delete(schema.sessions);
  await testDb.delete(schema.invites);
  await testDb.delete(schema.users);
}

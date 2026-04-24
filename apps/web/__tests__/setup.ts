/// <reference types="vitest/globals" />
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { schema } from "../lib/db/schema";

const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgres://roy:change-me-openssl-rand-base64-32@127.0.0.1:15432/roy_test";

const LIVE_DATABASE_URL = process.env.DATABASE_URL;

if (LIVE_DATABASE_URL && TEST_DATABASE_URL === LIVE_DATABASE_URL) {
  throw new Error(
    "Refusing to run tests against DATABASE_URL. Set TEST_DATABASE_URL to an isolated database.",
  );
}

process.env.DATABASE_URL = TEST_DATABASE_URL;

let sql: ReturnType<typeof postgres>;
export let testDb: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(async () => {
  // Ensure the test database exists, then reset its schema so migrations always
  // run against a clean slate even after interrupted local development runs.
  const adminSql = postgres(TEST_DATABASE_URL.replace(/\/[^/]+$/, "/postgres"), {
    prepare: false,
    onnotice: () => {},
  });
  try {
    await adminSql`CREATE DATABASE roy_test`;
  } catch {
    // Already exists or concurrent create — fine for test bootstrapping.
  }
  await adminSql.end();

  sql = postgres(TEST_DATABASE_URL, { prepare: false, onnotice: () => {} });
  await sql`DROP SCHEMA IF EXISTS public CASCADE`;
  await sql`DROP SCHEMA IF EXISTS drizzle CASCADE`;
  await sql`CREATE SCHEMA public`;
  await sql`CREATE EXTENSION IF NOT EXISTS vector`;
  testDb = drizzle(sql, { schema });
  await migrate(testDb, { migrationsFolder: "./drizzle" });
});

afterAll(async () => {
  await sql?.end();
});

export async function cleanDb() {
  await testDb.delete(schema.scriptRuns);
  await testDb.delete(schema.scripts);
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

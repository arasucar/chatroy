import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema";

const databaseUrl = process.env.DATABASE_URL;

export const sql = databaseUrl ? postgres(databaseUrl, { prepare: false }) : null;
export const db = sql ? drizzle(sql, { schema }) : null;

export function requireDb() {
  if (!db) {
    throw new Error("DATABASE_URL must be set before using the database layer.");
  }

  return db;
}

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema";

type SqlClient = ReturnType<typeof postgres>;
type DbClient = ReturnType<typeof drizzle<typeof schema>>;

let sql: SqlClient | null = null;
let db: DbClient | null = null;
let initError: Error | null = null;
let attemptedInitialization = false;

function initializeDb(): void {
  if (attemptedInitialization) return;
  attemptedInitialization = true;

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) return;

  try {
    sql = postgres(databaseUrl, { prepare: false });
    db = drizzle(sql, { schema });
  } catch (error) {
    initError = error instanceof Error ? error : new Error(String(error));
  }
}

export function getSql(): SqlClient | null {
  initializeDb();
  return sql;
}

export function getDb(): DbClient | null {
  initializeDb();
  return db;
}

export function requireDb() {
  initializeDb();

  if (db) {
    return db;
  }

  if (initError) {
    throw new Error(
      `Failed to initialize the database layer from DATABASE_URL: ${initError.message}`,
    );
  }

  if (!db) {
    throw new Error("DATABASE_URL must be set before using the database layer.");
  }

  return db;
}

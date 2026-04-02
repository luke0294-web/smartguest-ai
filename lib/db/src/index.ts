import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

/** Fail fast instead of hanging clients when the DB non risponde (rete, credenziali, VPN). */
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
  console.error("[DB:POOL] Errore inatteso sul pool PostgreSQL:", err?.message ?? err);
});

export const db = drizzle(pool, { schema });

export * from "./schema";

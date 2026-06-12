import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { databaseUrl } from "@/env";
import * as schema from "./schema";

declare global {
  // eslint-disable-next-line no-var
  var __vgcDb: ReturnType<typeof createDb> | undefined;
}

function createDb() {
  const client = postgres(databaseUrl(), { max: 5, prepare: false });
  return drizzle(client, { schema });
}

/** Reusa a conexao entre hot reloads do Next em dev. */
export const db = globalThis.__vgcDb ?? createDb();
globalThis.__vgcDb = db;

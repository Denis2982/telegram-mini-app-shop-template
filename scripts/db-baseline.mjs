import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import pg from "pg";
import { config } from "dotenv";

config({ path: [".env.local", ".env"] });

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const pool = new Pool({ connectionString: databaseUrl });
const migrationDir = path.resolve("drizzle");
const migrationMetaDir = path.join(migrationDir, "meta");
const tableNames = new Set([
  "categories",
  "order_items",
  "orders",
  "product_variants",
  "products",
  "promo_codes",
  "store_settings",
  "users",
]);

function snapshotMatches(snapshot, columnsByTable) {
  for (const [qualifiedName, table] of Object.entries(snapshot.tables ?? {})) {
    const tableName = qualifiedName.split(".").pop();
    const actualColumns = columnsByTable.get(tableName);
    if (!actualColumns || Object.keys(table.columns).some((column) => !actualColumns.has(column))) return false;
  }
  return true;
}

async function baselineExistingSchema() {
  const { rows } = await pool.query(
    "SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public'",
  );
  const columnsByTable = new Map();
  for (const row of rows) {
    if (!columnsByTable.has(row.table_name)) columnsByTable.set(row.table_name, new Set());
    columnsByTable.get(row.table_name).add(row.column_name);
  }

  if (![...tableNames].some((tableName) => columnsByTable.has(tableName))) {
    console.log("No application tables found; no migration baseline is needed.");
    return;
  }

  const { rows: migrationTable } = await pool.query("SELECT to_regclass('drizzle.__drizzle_migrations') AS name");
  if (migrationTable[0]?.name) {
    const { rows: applied } = await pool.query("SELECT id FROM drizzle.__drizzle_migrations LIMIT 1");
    if (applied.length) {
      console.log("Migration history already exists; no baseline is needed.");
      return;
    }
  }

  if (!process.argv.includes("--confirm-existing-schema")) {
    throw new Error(
      "An existing application schema has no migration history. Back it up, verify it was created by this template, then rerun with --confirm-existing-schema.",
    );
  }

  const journal = JSON.parse(await readFile(path.join(migrationMetaDir, "_journal.json"), "utf8"));
  const baselineEntries = [];
  for (const entry of journal.entries) {
    const snapshotPath = path.join(migrationMetaDir, `${String(entry.idx).padStart(4, "0")}_snapshot.json`);
    const snapshot = JSON.parse(await readFile(snapshotPath, "utf8"));
    if (!snapshotMatches(snapshot, columnsByTable)) break;
    baselineEntries.push(entry);
  }
  if (!baselineEntries.length) {
    throw new Error("The existing database does not match any known migration snapshot; no changes were made.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("CREATE SCHEMA IF NOT EXISTS drizzle");
    await client.query(`
      CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (
        id SERIAL PRIMARY KEY,
        hash text NOT NULL,
        created_at bigint
      )
    `);

    const { rows: applied } = await client.query("SELECT id FROM drizzle.__drizzle_migrations LIMIT 1");
    if (applied.length) {
      await client.query("ROLLBACK");
      console.log("Migration history was initialized concurrently; no baseline was added.");
      return;
    }

    for (const entry of baselineEntries) {
      const contents = await readFile(path.join(migrationDir, `${entry.tag}.sql`));
      const hash = createHash("sha256").update(contents).digest("hex");
      await client.query(
        "INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
        [hash, entry.when],
      );
    }
    await client.query("COMMIT");
    console.log(`Recorded ${baselineEntries.length} verified migration baseline(s).`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

baselineExistingSchema()
  .catch((error) => {
    console.error("Could not baseline existing database schema:", error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());

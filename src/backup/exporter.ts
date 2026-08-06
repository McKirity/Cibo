/**
 * THE PLAIN-READABLE EXPORT (step 12) — the canonical JSON + the two CSVs,
 * generated from the live tables at backup time ([[Backups & Export]]
 * § Contents: "one canonical JSON file (the full relational shape, IDs
 * intact, lossless) + CSVs for Sessions and Entries (the two tables worth
 * opening in a spreadsheet)").
 *
 * Rows go out as SQL returns them — Evolu auto-columns included, tombstones
 * included (`isDeleted` rides as a column; lossless means lossless). The
 * parse-back verify lives in backup.ts, where the ruled ordering is enforced.
 */
import { evolu } from "../db/evolu";

export const TABLES = [
  "habits",
  "entries",
  "sessions",
  "days",
  "subunit_definitions",
  "subunit_values",
  "vocab_options",
  "app_meta",
] as const;

export type TableName = (typeof TABLES)[number];
export type Row = Record<string, unknown>;

/** One query object per table, built ONCE and reused (2026-08-04 —
 *  `createQuery` ran inside the loop, minting eight fresh queries on every
 *  backup, where the rest of the app hoists to module scope). Memoized rather
 *  than a literal map so each table keeps its own precise row type. */
const tableQueryCache = new Map<TableName, ReturnType<typeof tableQuery>>();
const tableQuery = (t: TableName) => evolu.createQuery((db) => db.selectFrom(t).selectAll());
const queryFor = (t: TableName) => {
  const hit = tableQueryCache.get(t);
  if (hit != null) return hit;
  const q = tableQuery(t);
  tableQueryCache.set(t, q);
  return q;
};

export async function readAllTables(): Promise<Record<TableName, Row[]>> {
  const out = {} as Record<TableName, Row[]>;
  for (const t of TABLES) {
    const rows = await evolu.loadQuery(queryFor(t));
    out[t] = rows.map((r) => ({ ...(r as Row) }));
  }
  return out;
}

/** The one canonical JSON file — shape + provenance header, rows verbatim. */
export const toCanonicalJson = (tables: Record<TableName, Row[]>, exportedAt: string): string =>
  JSON.stringify({ app: "Cibo", format: 1, exportedAt, tables }, null, 1);

const csvCell = (v: unknown): string => {
  if (v == null) return "";
  const s = typeof v === "string" ? v : typeof v === "number" || typeof v === "boolean" ? String(v) : JSON.stringify(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Flat CSV, one row per record; the header is the table's own column set. */
export function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "";
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n");
}

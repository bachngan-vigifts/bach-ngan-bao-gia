import { readFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pg from "pg";

const exportDir = process.env.EXPORT_DIR || ".appsheet-export/vigifts";
const sourceAppId = process.env.SOURCE_APP_ID || "ad0117e6-9c42-465a-bdfa-b31e90b35248";
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw Error("DATABASE_URL is required.");

const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const lines = (file) => {
  const text = readFileSync(file, "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line)) : [];
};
const sourceTime = (value) => {
  if (typeof value !== "string" || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};
const searchText = (values) => normalize(Object.values(values || {}).map((value) => {
  if (Array.isArray(value)) return value.map((item) => typeof item === "object" ? item?.label || item?.tupleId || "" : item).join(" ");
  return typeof value === "object" && value ? value.label || value.tupleId || value.itemId || "" : value;
}).join(" ")).slice(0, 12000);

const manifest = JSON.parse(readFileSync(path.join(exportDir, "manifest.json"), "utf8"));
const migration = readFileSync("neon/migrations/0001_vigifts_crm_source_mirror.sql", "utf8");
const runId = crypto.randomUUID();
const client = new pg.Client({ connectionString });

async function insertRows(tableName, rows) {
  for (let start = 0; start < rows.length; start += 100) {
    const batch = rows.slice(start, start + 100);
    const values = [];
    const tuples = batch.map((row, index) => {
      const base = index * 10;
      values.push(sourceAppId, tableName, row.tupleId, row.values || {}, row.raw || {}, searchText(row.values), sourceTime(row.createdAt), sourceTime(row.updatedAt), runId, new Date().toISOString());
      return `(${Array.from({ length: 10 }, (_, item) => `$${base + item + 1}`).join(",")})`;
    });
    await client.query(`INSERT INTO crm.appsheet_rows (source_app_id,table_name,tuple_id,values_json,raw_json,search_text,source_created_at,source_updated_at,last_import_run_id,imported_at) VALUES ${tuples.join(",")} ON CONFLICT (source_app_id,table_name,tuple_id) DO UPDATE SET values_json=EXCLUDED.values_json,raw_json=EXCLUDED.raw_json,search_text=EXCLUDED.search_text,source_created_at=EXCLUDED.source_created_at,source_updated_at=EXCLUDED.source_updated_at,last_import_run_id=EXCLUDED.last_import_run_id,imported_at=EXCLUDED.imported_at`, values);
  }
}

try {
  await client.connect();
  await client.query(migration);
  await client.query("BEGIN");
  await client.query("INSERT INTO crm.appsheet_import_runs (id,source_name,source_app_id,source_exported_at,status,table_count,row_count,details) VALUES ($1,'AppSheet export',$2,$3,'running',$4,$5,$6)", [runId, sourceAppId, sourceTime(manifest.exportedAt), manifest.tables.length, manifest.tables.reduce((sum, table) => sum + Number(table.rows || 0), 0), { exportDirectory: "private", manifestExportedAt: manifest.exportedAt }]);
  let imported = 0;
  for (const table of manifest.tables) {
    const meta = JSON.parse(readFileSync(path.join(exportDir, "tables", `${table.safeName}.meta.json`), "utf8"));
    await client.query("INSERT INTO crm.appsheet_tables (source_app_id,table_name,safe_name,base_id,frame_id,schema_name,update_mode,allowed_updates,source_json,imported_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) ON CONFLICT (source_app_id,table_name) DO UPDATE SET safe_name=EXCLUDED.safe_name,base_id=EXCLUDED.base_id,frame_id=EXCLUDED.frame_id,schema_name=EXCLUDED.schema_name,update_mode=EXCLUDED.update_mode,allowed_updates=EXCLUDED.allowed_updates,source_json=EXCLUDED.source_json,imported_at=EXCLUDED.imported_at", [sourceAppId, table.name, table.safeName, table.baseId || "", table.frameId || "", table.schemaName || "", Number(table.updateMode || 0), Number(table.allowedUpdates || 0), { source: table.source || "" }]);
    for (const [ordinal, field] of (meta.fields || []).entries()) {
      await client.query("INSERT INTO crm.appsheet_fields (source_app_id,table_name,field_id,field_name,field_type,ordinal,field_json,imported_at) VALUES ($1,$2,$3,$4,$5,$6,$7,now()) ON CONFLICT (source_app_id,table_name,field_id) DO UPDATE SET field_name=EXCLUDED.field_name,field_type=EXCLUDED.field_type,ordinal=EXCLUDED.ordinal,field_json=EXCLUDED.field_json,imported_at=EXCLUDED.imported_at", [sourceAppId, table.name, field.fieldId || field.name || String(ordinal), field.name || field.fieldId || String(ordinal), field.type || "", ordinal, field.raw || field]);
    }
    const rows = lines(path.join(exportDir, "tables", `${table.safeName}.jsonl`));
    await insertRows(table.name, rows);
    imported += rows.length;
    console.log(JSON.stringify({ table: table.name, imported, total: manifest.tables.reduce((sum, item) => sum + Number(item.rows || 0), 0) }));
  }
  await client.query("UPDATE crm.appsheet_import_runs SET status='completed',completed_at=now() WHERE id=$1", [runId]);
  await client.query("COMMIT");
  console.log(JSON.stringify({ ok: true, runId, tables: manifest.tables.length, rows: imported }));
} catch (error) {
  try { await client.query("ROLLBACK"); } catch {}
  throw error;
} finally {
  await client.end();
}

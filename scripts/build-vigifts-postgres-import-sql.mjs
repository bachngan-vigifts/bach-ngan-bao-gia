import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const exportDir = process.env.EXPORT_DIR || ".appsheet-export/vigifts";
const output = process.env.OUT_SQL || path.join(exportDir, "postgres-import.sql");
const sourceAppId = process.env.SOURCE_APP_ID || "ad0117e6-9c42-465a-bdfa-b31e90b35248";
const runId = process.env.IMPORT_RUN_ID || crypto.randomUUID();
const now = new Date().toISOString();

const sql = (value) => value == null ? "NULL" : `'${String(value).replace(/'/g, "''")}'`;
const json = (value) => `${sql(JSON.stringify(value ?? {}))}::jsonb`;
const normalize = (value) => String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
const lines = (file) => {
  const text = readFileSync(file, "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line)) : [];
};
const searchText = (values) => normalize(Object.values(values || {}).map((value) => {
  if (Array.isArray(value)) return value.map((item) => typeof item === "object" ? item?.label || item?.tupleId || "" : item).join(" ");
  return typeof value === "object" && value ? value.label || value.tupleId || value.itemId || "" : value;
}).join(" ")).slice(0, 12000);

const manifest = JSON.parse(readFileSync(path.join(exportDir, "manifest.json"), "utf8"));
const statements = [
  "BEGIN;",
  `INSERT INTO crm.appsheet_import_runs (id,source_name,source_app_id,source_exported_at,status,table_count,row_count,details) VALUES (${sql(runId)}::uuid,'AppSheet export',${sql(sourceAppId)},${sql(manifest.exportedAt)}::timestamptz,'running',${manifest.tables.length},${manifest.tables.reduce((sum, table) => sum + Number(table.rows || 0), 0)},${json({ exportDirectory: "private", manifestExportedAt: manifest.exportedAt })});`,
];

for (const table of manifest.tables) {
  const meta = JSON.parse(readFileSync(path.join(exportDir, "tables", `${table.safeName}.meta.json`), "utf8"));
  statements.push(`INSERT INTO crm.appsheet_tables (source_app_id,table_name,safe_name,base_id,frame_id,schema_name,update_mode,allowed_updates,source_json,imported_at) VALUES (${sql(sourceAppId)},${sql(table.name)},${sql(table.safeName)},${sql(table.baseId)},${sql(table.frameId)},${sql(table.schemaName)},${Number(table.updateMode || 0)},${Number(table.allowedUpdates || 0)},${json({ source: table.source || "" })},${sql(now)}::timestamptz) ON CONFLICT (source_app_id,table_name) DO UPDATE SET safe_name=EXCLUDED.safe_name,base_id=EXCLUDED.base_id,frame_id=EXCLUDED.frame_id,schema_name=EXCLUDED.schema_name,update_mode=EXCLUDED.update_mode,allowed_updates=EXCLUDED.allowed_updates,source_json=EXCLUDED.source_json,imported_at=EXCLUDED.imported_at;`);
  for (const [ordinal, field] of (meta.fields || []).entries()) {
    statements.push(`INSERT INTO crm.appsheet_fields (source_app_id,table_name,field_id,field_name,field_type,ordinal,field_json,imported_at) VALUES (${sql(sourceAppId)},${sql(table.name)},${sql(field.fieldId || field.name || String(ordinal))},${sql(field.name || field.fieldId || String(ordinal))},${sql(field.type || "")},${ordinal},${json(field.raw || field)},${sql(now)}::timestamptz) ON CONFLICT (source_app_id,table_name,field_id) DO UPDATE SET field_name=EXCLUDED.field_name,field_type=EXCLUDED.field_type,ordinal=EXCLUDED.ordinal,field_json=EXCLUDED.field_json,imported_at=EXCLUDED.imported_at;`);
  }
  const values = lines(path.join(exportDir, "tables", `${table.safeName}.jsonl`)).map((row) => `(${sql(sourceAppId)},${sql(table.name)},${sql(row.tupleId)},${json(row.values || {})},${json(row.raw || {})},${sql(searchText(row.values))},${sql(row.createdAt)}::timestamptz,${sql(row.updatedAt)}::timestamptz,${sql(runId)}::uuid,${sql(now)}::timestamptz)`);
  for (let index = 0; index < values.length; index += 100) {
    statements.push(`INSERT INTO crm.appsheet_rows (source_app_id,table_name,tuple_id,values_json,raw_json,search_text,source_created_at,source_updated_at,last_import_run_id,imported_at) VALUES ${values.slice(index, index + 100).join(",")} ON CONFLICT (source_app_id,table_name,tuple_id) DO UPDATE SET values_json=EXCLUDED.values_json,raw_json=EXCLUDED.raw_json,search_text=EXCLUDED.search_text,source_created_at=EXCLUDED.source_created_at,source_updated_at=EXCLUDED.source_updated_at,last_import_run_id=EXCLUDED.last_import_run_id,imported_at=EXCLUDED.imported_at;`);
  }
}

statements.push(`UPDATE crm.appsheet_import_runs SET status='completed',completed_at=now() WHERE id=${sql(runId)}::uuid;`, "COMMIT;");
writeFileSync(output, statements.join("\n") + "\n");
console.log(JSON.stringify({ ok: true, output, runId, tables: manifest.tables.length, rows: manifest.tables.reduce((sum, table) => sum + Number(table.rows || 0), 0) }));

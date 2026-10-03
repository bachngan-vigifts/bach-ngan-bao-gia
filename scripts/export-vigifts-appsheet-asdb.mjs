import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const defaultAppDef =
  "/home/node/.openclaw/workspace/reports/vigifts_live_verify_20260905_fix_vigifts_cham_kpi_month_context.json";
const appDefPath = process.env.VIGIFTS_APPSHEET_APPDEF || defaultAppDef;
const cookieJar =
  process.env.APPSHEET_COOKIE_JAR || "/home/node/.openclaw/credentials/appsheet-season-crm.cookies";
const apiKey = process.env.ASDB_API_KEY || process.env.APPSHEET_ASDB_API_KEY;
const outDir = process.env.OUT_DIR || ".appsheet-export/vigifts";
const onlyTables = new Set(
  (process.env.TABLES || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const limit = Number(process.env.LIMIT || 0);

if (!apiKey) {
  console.error("Missing ASDB_API_KEY or APPSHEET_ASDB_API_KEY.");
  process.exit(2);
}

function asdbCall(method, body, baseId) {
  const response = spawnSync(
    "curl",
    [
      "--max-time",
      "120",
      "-sS",
      "-b",
      cookieJar,
      "-H",
      "Content-Type: application/json",
      "-H",
      "Origin: https://www.appsheet.com",
      "-H",
      `Referer: https://www.appsheet.com/dbs/database/${baseId}`,
      `https://www.appsheet.com/v1/frames:${method}?key=${apiKey}`,
      "--data",
      JSON.stringify(body),
      "-w",
      "\nHTTP:%{http_code}\n",
    ],
    { encoding: "utf8", maxBuffer: 200 * 1024 * 1024 },
  );
  const stdout = response.stdout || "";
  const match = stdout.match(/\nHTTP:(\d+)\n?$/);
  const http = match ? Number(match[1]) : 0;
  const text = match ? stdout.slice(0, match.index) : stdout;
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {}
  if (http < 200 || http >= 300 || !json) {
    throw new Error(
      `AppSheet Database ${method} failed HTTP ${http}: ${(text || response.stderr || "").slice(0, 800)}`,
    );
  }
  return json;
}

function slug(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function extractSourceTables(app) {
  return (app.AppData?.DataSets || [])
    .map((table) => {
      const match = String(table.Source || "").match(/base\/([^/]+)\/tables\/([^/]+)/);
      if (!match) return null;
      return {
        name: table.Name,
        schemaName: table.SchemaName,
        baseId: match[1],
        frameId: match[2],
        source: table.Source,
        updateMode: table.UpdateMode,
        allowedUpdates: table.AllowedUpdates,
      };
    })
    .filter(Boolean)
    .filter((table) => !onlyTables.size || onlyTables.has(table.name));
}

function frameFields(frame) {
  const defs = frame?.schema?.fieldDefs || [];
  return defs.map((field) => ({
    fieldId: field.fieldId,
    name: field.name || field.Name || field.displayName || field.label || field.fieldId,
    type: field.type || field.fieldType || field.valueType || "",
    raw: field,
  }));
}

function oneOfLabel(fieldDef, itemId) {
  const items = fieldDef?.raw?.oneOfOptions?.items || [];
  return items.find((item) => item.itemId === itemId)?.label || itemId;
}

function decodeField(field, fieldDef) {
  if (field.textValue) return field.textValue.value ?? "";
  if (field.floatValue) return Number(field.floatValue.value);
  if (field.integerValue) return Number(field.integerValue.value);
  if (field.boolValue) return Boolean(field.boolValue.value);
  if (field.booleanValue) return Boolean(field.booleanValue.value);
  if (field.oneOfValue) {
    const itemId = field.oneOfValue.itemId || "";
    return { itemId, label: oneOfLabel(fieldDef, itemId) };
  }
  if (field.referenceValue) return { tupleId: field.referenceValue.tupleId || "" };
  if (field.dateValue) return field.dateValue.value || field.dateValue;
  if (field.dateTimeValue) return field.dateTimeValue.value || field.dateTimeValue;
  if (field.timestampValue) return field.timestampValue.value || field.timestampValue;
  if (field.imageValue) return field.imageValue;
  if (field.fileValue) return field.fileValue;
  if (field.listValue) return field.listValue;
  return field;
}

function tupleToRecord(tuple, fields) {
  const byId = new Map(fields.map((field) => [field.fieldId, field]));
  const record = {
    tupleId: tuple.tupleId,
    deleted: Boolean(tuple.deleted),
    createdAt: tuple.createdAt || null,
    updatedAt: tuple.updatedAt || null,
    values: {},
  };
  for (const field of tuple.tupleValue?.fields || []) {
    const def = byId.get(field.fieldId) || { fieldId: field.fieldId, name: field.fieldId };
    record.values[def.name] = decodeField(field, def);
  }
  return record;
}

function listTuples(table) {
  const tuples = [];
  let pageToken = "";
  do {
    const body = {
      frameId: table.frameId,
      count: limit ? Math.min(limit - tuples.length, 500) : 500,
      selectedContent: "ALL_CONTENT",
      filter: "TUPLE_FILTER_UNKNOWN",
    };
    if (pageToken) body.pageToken = pageToken;
    const data = asdbCall("listTuples", body, table.baseId);
    tuples.push(...(data.tuples || []));
    pageToken = limit && tuples.length >= limit ? "" : data.nextPageToken || "";
  } while (pageToken);
  return tuples;
}

function main() {
  const app = JSON.parse(readFileSync(appDefPath, "utf8"));
  const tables = extractSourceTables(app);
  mkdirSync(path.join(outDir, "tables"), { recursive: true });
  const manifest = {
    exportedAt: new Date().toISOString(),
    appDefPath,
    tableCount: tables.length,
    limit: limit || null,
    tables: [],
  };

  for (const table of tables) {
    const safe = slug(table.name || table.frameId) || table.frameId;
    console.error(`Exporting ${table.name} (${table.frameId})...`);
    const frame = asdbCall("getFrame", { frameId: table.frameId }, table.baseId).frame;
    const fields = frameFields(frame);
    const tuples = listTuples(table);
    const records = tuples.filter((tuple) => !tuple.deleted).map((tuple) => tupleToRecord(tuple, fields));
    const meta = { ...table, safeName: safe, fields, frame };
    writeFileSync(path.join(outDir, "tables", `${safe}.meta.json`), JSON.stringify(meta, null, 2));
    writeFileSync(
      path.join(outDir, "tables", `${safe}.jsonl`),
      records.map((record) => JSON.stringify(record)).join("\n") + (records.length ? "\n" : ""),
    );
    manifest.tables.push({ ...table, safeName: safe, fields: fields.length, rows: records.length });
  }

  writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ok: true, outDir, tableCount: tables.length, tables: manifest.tables }, null, 2));
}

main();

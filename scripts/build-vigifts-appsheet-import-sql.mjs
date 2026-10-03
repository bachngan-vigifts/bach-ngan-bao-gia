import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const exportDir = process.env.EXPORT_DIR || ".appsheet-export/vigifts";
const appDefPath =
  process.env.VIGIFTS_APPSHEET_APPDEF ||
  "/home/node/.openclaw/workspace/reports/vigifts_live_verify_20260905_fix_vigifts_cham_kpi_month_context.json";
const output = process.env.OUT_SQL || path.join(exportDir, "import.sql");
const appId = process.env.APP_ID || "vigifts-crm";

function sql(value) {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function compactJson(value) {
  return JSON.stringify(value ?? {});
}

function searchText(record) {
  return Object.values(record.values || {})
    .map((value) => {
      if (value && typeof value === "object") return value.label || value.tupleId || value.itemId || "";
      return value ?? "";
    })
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .slice(0, 4000);
}

function lines(file) {
  const text = readFileSync(file, "utf8").trim();
  return text ? text.split("\n").map((line) => JSON.parse(line)) : [];
}

function loadAppMetadata(app) {
  return {
    views: (app.Presentation?.Controls || []).map((view) => ({
      name: view.Name,
      displayName: view.DisplayName || "",
      position: view.Position || "",
      tableName: view.TableOrFolderName || "",
      action: view.Action || "",
      actionType: view.ActionType || "",
      order: Number(view.MenuOrder || 0),
      showIf: view.ShowIf || null,
      raw: view,
    })),
    actions: (app.AppData?.DataActions || []).map((action) => ({
      name: action.Name,
      displayName: action.DisplayName || "",
      tableName: action.Table || "",
      actionType: action.ActionType || "",
      icon: action.Icon || "",
      condition: action.Condition || null,
      modifiesData: Boolean(action.ActionDefinition?.ModifiesData),
      raw: action,
    })),
    bots: (app.Behavior?.AppBots || []).map((bot) => ({
      name: bot.Name,
      eventName: bot.EventName || "",
      processName: bot.ProcessName || "",
      disabled: Boolean(bot.Disabled),
      raw: bot,
    })),
  };
}

function main() {
  const manifest = JSON.parse(readFileSync(path.join(exportDir, "manifest.json"), "utf8"));
  const app = JSON.parse(readFileSync(appDefPath, "utf8"));
  const meta = loadAppMetadata(app);
  const importedAt = new Date().toISOString();
  const out = [
    "BEGIN TRANSACTION;",
    `INSERT OR REPLACE INTO vigifts_appsheet_apps (id,title,source_app_id,source_version,app_definition_json,exported_at,imported_at) VALUES (${sql(appId)},${sql(app.Title || app.Name || "VIGIFTS CRM")},${sql(app.Id || "")},${sql(app.Version || "")},${sql(compactJson({ id: app.Id, title: app.Title, version: app.Version, stableVersion: app.StableVersion }))},${sql(manifest.exportedAt)},${sql(importedAt)});`,
  ];

  for (const table of manifest.tables) {
    const metaFile = path.join(exportDir, "tables", `${table.safeName}.meta.json`);
    const rowFile = path.join(exportDir, "tables", `${table.safeName}.jsonl`);
    const tableMeta = JSON.parse(readFileSync(metaFile, "utf8"));
    out.push(
      `INSERT OR REPLACE INTO vigifts_appsheet_tables (app_id,table_name,safe_name,base_id,frame_id,schema_name,update_mode,allowed_updates,source_json) VALUES (${sql(appId)},${sql(table.name)},${sql(table.safeName)},${sql(table.baseId)},${sql(table.frameId)},${sql(table.schemaName)},${Number(table.updateMode || 0)},${Number(table.allowedUpdates || 0)},${sql(compactJson({ source: table.source }))});`,
    );
    tableMeta.fields.forEach((field, index) => {
      out.push(
        `INSERT OR REPLACE INTO vigifts_appsheet_fields (app_id,table_name,field_id,field_name,field_type,ordinal,is_key,is_label,is_required,is_hidden,is_virtual,expression_json,field_json) VALUES (${sql(appId)},${sql(table.name)},${sql(field.fieldId)},${sql(field.name)},${sql(field.type || "")},${index},0,0,0,0,0,${sql("{}")},${sql(compactJson(field.raw || {}))});`,
      );
    });
    for (const record of lines(rowFile)) {
      out.push(
        `INSERT OR REPLACE INTO vigifts_appsheet_rows (app_id,table_name,tuple_id,values_json,raw_json,search_text,source_created_at,source_updated_at,imported_at) VALUES (${sql(appId)},${sql(table.name)},${sql(record.tupleId)},${sql(compactJson(record.values))},${sql(compactJson(record.raw || {}))},${sql(searchText(record))},${sql(record.createdAt)},${sql(record.updatedAt)},${sql(importedAt)});`,
      );
    }
  }

  for (const view of meta.views) {
    out.push(
      `INSERT OR REPLACE INTO vigifts_appsheet_views (app_id,view_name,display_name,position,table_name,action,action_type,view_order,show_if,view_json) VALUES (${sql(appId)},${sql(view.name)},${sql(view.displayName)},${sql(view.position)},${sql(view.tableName)},${sql(view.action)},${sql(view.actionType)},${Number(view.order || 0)},${sql(view.showIf)},${sql(compactJson(view.raw))});`,
    );
  }
  for (const action of meta.actions) {
    out.push(
      `INSERT OR REPLACE INTO vigifts_appsheet_actions (app_id,action_name,display_name,table_name,action_type,icon,condition,modifies_data,action_json) VALUES (${sql(appId)},${sql(action.name)},${sql(action.displayName)},${sql(action.tableName)},${sql(action.actionType)},${sql(action.icon)},${sql(action.condition)},${action.modifiesData ? 1 : 0},${sql(compactJson(action.raw))});`,
    );
  }
  for (const bot of meta.bots) {
    out.push(
      `INSERT OR REPLACE INTO vigifts_appsheet_bots (app_id,bot_name,event_name,process_name,disabled,bot_json) VALUES (${sql(appId)},${sql(bot.name)},${sql(bot.eventName)},${sql(bot.processName)},${bot.disabled ? 1 : 0},${sql(compactJson(bot.raw))});`,
    );
  }

  out.push("COMMIT;");
  writeFileSync(output, out.join("\n") + "\n");
  console.log(
    JSON.stringify(
      {
        ok: true,
        output,
        tables: manifest.tables.length,
        rows: manifest.tables.reduce((sum, table) => sum + table.rows, 0),
        views: meta.views.length,
        actions: meta.actions.length,
        bots: meta.bots.length,
      },
      null,
      2,
    ),
  );
}

main();

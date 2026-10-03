BEGIN;

CREATE SCHEMA IF NOT EXISTS crm;

CREATE TABLE IF NOT EXISTS crm.appsheet_import_runs (
  id uuid PRIMARY KEY,
  source_name text NOT NULL,
  source_app_id text NOT NULL,
  source_exported_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
  table_count integer NOT NULL DEFAULT 0,
  row_count integer NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS crm.appsheet_tables (
  source_app_id text NOT NULL,
  table_name text NOT NULL,
  safe_name text NOT NULL,
  base_id text NOT NULL DEFAULT '',
  frame_id text NOT NULL DEFAULT '',
  schema_name text NOT NULL DEFAULT '',
  update_mode integer NOT NULL DEFAULT 0,
  allowed_updates integer NOT NULL DEFAULT 0,
  source_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL,
  PRIMARY KEY (source_app_id, table_name)
);

CREATE TABLE IF NOT EXISTS crm.appsheet_fields (
  source_app_id text NOT NULL,
  table_name text NOT NULL,
  field_id text NOT NULL,
  field_name text NOT NULL,
  field_type text NOT NULL DEFAULT '',
  ordinal integer NOT NULL,
  field_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  imported_at timestamptz NOT NULL,
  PRIMARY KEY (source_app_id, table_name, field_id),
  FOREIGN KEY (source_app_id, table_name) REFERENCES crm.appsheet_tables (source_app_id, table_name) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS crm.appsheet_rows (
  source_app_id text NOT NULL,
  table_name text NOT NULL,
  tuple_id text NOT NULL,
  values_json jsonb NOT NULL,
  raw_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_text text NOT NULL DEFAULT '',
  source_created_at timestamptz,
  source_updated_at timestamptz,
  last_import_run_id uuid REFERENCES crm.appsheet_import_runs (id),
  imported_at timestamptz NOT NULL,
  PRIMARY KEY (source_app_id, table_name, tuple_id),
  FOREIGN KEY (source_app_id, table_name) REFERENCES crm.appsheet_tables (source_app_id, table_name) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS appsheet_rows_table_idx ON crm.appsheet_rows (source_app_id, table_name);
CREATE INDEX IF NOT EXISTS appsheet_rows_import_idx ON crm.appsheet_rows (last_import_run_id);
CREATE INDEX IF NOT EXISTS appsheet_rows_search_idx ON crm.appsheet_rows USING gin (to_tsvector('simple', search_text));

COMMIT;

ALTER TABLE `sapo_customers` ADD `created_at` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE sapo_customers SET created_at = CASE
 WHEN id LIKE 'local_%' THEN COALESCE(strftime('%Y-%m-%dT%H:%M:%fZ', source_version / 1000.0, 'unixepoch'), synced_at)
 ELSE synced_at END WHERE created_at = '';

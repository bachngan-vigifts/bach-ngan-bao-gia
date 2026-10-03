CREATE TABLE `vigifts_appsheet_apps` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`source_app_id` text NOT NULL,
	`source_version` text DEFAULT '' NOT NULL,
	`app_definition_json` text NOT NULL,
	`exported_at` text NOT NULL,
	`imported_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vigifts_appsheet_tables` (
	`app_id` text NOT NULL,
	`table_name` text NOT NULL,
	`safe_name` text NOT NULL,
	`base_id` text NOT NULL,
	`frame_id` text NOT NULL,
	`schema_name` text NOT NULL,
	`update_mode` integer DEFAULT 0 NOT NULL,
	`allowed_updates` integer DEFAULT 0 NOT NULL,
	`source_json` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`app_id`, `table_name`),
	FOREIGN KEY (`app_id`) REFERENCES `vigifts_appsheet_apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_vigifts_tables_frame` ON `vigifts_appsheet_tables` (`app_id`,`frame_id`);--> statement-breakpoint
CREATE INDEX `idx_vigifts_tables_safe` ON `vigifts_appsheet_tables` (`safe_name`);--> statement-breakpoint
CREATE TABLE `vigifts_appsheet_fields` (
	`app_id` text NOT NULL,
	`table_name` text NOT NULL,
	`field_id` text NOT NULL,
	`field_name` text NOT NULL,
	`field_type` text DEFAULT '' NOT NULL,
	`ordinal` integer DEFAULT 0 NOT NULL,
	`is_key` integer DEFAULT false NOT NULL,
	`is_label` integer DEFAULT false NOT NULL,
	`is_required` integer DEFAULT false NOT NULL,
	`is_hidden` integer DEFAULT false NOT NULL,
	`is_virtual` integer DEFAULT false NOT NULL,
	`expression_json` text DEFAULT '{}' NOT NULL,
	`field_json` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`app_id`, `table_name`, `field_id`),
	FOREIGN KEY (`app_id`) REFERENCES `vigifts_appsheet_apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_vigifts_fields_name` ON `vigifts_appsheet_fields` (`app_id`,`table_name`,`field_name`);--> statement-breakpoint
CREATE TABLE `vigifts_appsheet_rows` (
	`app_id` text NOT NULL,
	`table_name` text NOT NULL,
	`tuple_id` text NOT NULL,
	`values_json` text NOT NULL,
	`raw_json` text DEFAULT '{}' NOT NULL,
	`search_text` text DEFAULT '' NOT NULL,
	`source_created_at` text,
	`source_updated_at` text,
	`imported_at` text NOT NULL,
	PRIMARY KEY(`app_id`, `table_name`, `tuple_id`),
	FOREIGN KEY (`app_id`) REFERENCES `vigifts_appsheet_apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_vigifts_rows_table` ON `vigifts_appsheet_rows` (`app_id`,`table_name`);--> statement-breakpoint
CREATE INDEX `idx_vigifts_rows_search` ON `vigifts_appsheet_rows` (`search_text`);--> statement-breakpoint
CREATE TABLE `vigifts_appsheet_views` (
	`app_id` text NOT NULL,
	`view_name` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`position` text DEFAULT '' NOT NULL,
	`table_name` text DEFAULT '' NOT NULL,
	`action` text DEFAULT '' NOT NULL,
	`action_type` text DEFAULT '' NOT NULL,
	`view_order` integer DEFAULT 0 NOT NULL,
	`show_if` text,
	`view_json` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`app_id`, `view_name`),
	FOREIGN KEY (`app_id`) REFERENCES `vigifts_appsheet_apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_vigifts_views_position` ON `vigifts_appsheet_views` (`app_id`,`position`,`view_order`);--> statement-breakpoint
CREATE TABLE `vigifts_appsheet_actions` (
	`app_id` text NOT NULL,
	`action_name` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`table_name` text DEFAULT '' NOT NULL,
	`action_type` text DEFAULT '' NOT NULL,
	`icon` text DEFAULT '' NOT NULL,
	`condition` text,
	`modifies_data` integer DEFAULT false NOT NULL,
	`action_json` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`app_id`, `action_name`, `table_name`),
	FOREIGN KEY (`app_id`) REFERENCES `vigifts_appsheet_apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_vigifts_actions_table` ON `vigifts_appsheet_actions` (`app_id`,`table_name`);--> statement-breakpoint
CREATE TABLE `vigifts_appsheet_bots` (
	`app_id` text NOT NULL,
	`bot_name` text NOT NULL,
	`event_name` text DEFAULT '' NOT NULL,
	`process_name` text DEFAULT '' NOT NULL,
	`disabled` integer DEFAULT false NOT NULL,
	`bot_json` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`app_id`, `bot_name`),
	FOREIGN KEY (`app_id`) REFERENCES `vigifts_appsheet_apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_vigifts_bots_disabled` ON `vigifts_appsheet_bots` (`app_id`,`disabled`);

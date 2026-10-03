CREATE TABLE `work_assignments` (
	`member_id` text NOT NULL,
	`branch_id` text NOT NULL,
	`sapo_account_id` text NOT NULL,
	`updated_at` text NOT NULL,
	PRIMARY KEY(`member_id`, `branch_id`),
	FOREIGN KEY (`member_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`branch_id`) REFERENCES `work_branches`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_work_branch_account` ON `work_assignments` (`branch_id`,`sapo_account_id`);--> statement-breakpoint
CREATE TABLE `work_audit` (
	`id` text PRIMARY KEY NOT NULL,
	`entity_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`action` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `idx_work_audit_entity` ON `work_audit` (`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `work_branches` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`keeper_id` text,
	`updated_at` text NOT NULL
);--> statement-breakpoint
CREATE TABLE `work_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_id` text NOT NULL,
	`member_id` text NOT NULL,
	`position_id` text NOT NULL,
	`phase` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`data` text NOT NULL,
	`snapshot` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	`submitted_at` text,
	`reviewed_by` text,
	`review_note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `work_shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_work_report_once` ON `work_reports` (`shift_id`,`member_id`,`phase`);--> statement-breakpoint
CREATE INDEX `idx_work_reports_member` ON `work_reports` (`member_id`,`updated_at`);--> statement-breakpoint
CREATE INDEX `idx_work_reports_status` ON `work_reports` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `work_shifts` (
	`id` text PRIMARY KEY NOT NULL,
	`branch_id` text NOT NULL,
	`work_date` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`label` text NOT NULL,
	`keeper_id` text,
	`opening` integer,
	`actual` integer,
	`expected` integer,
	`difference` integer,
	`cash_status` text DEFAULT 'not_opened' NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`branch_id`) REFERENCES `work_branches`(`id`) ON UPDATE no action ON DELETE no action
);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_work_shift_period` ON `work_shifts` (`branch_id`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE INDEX `idx_work_branch_time` ON `work_shifts` (`branch_id`,`ends_at`);--> statement-breakpoint
CREATE TABLE `work_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_id` text NOT NULL,
	`member_id` text NOT NULL,
	`data` text NOT NULL,
	`created_at` text NOT NULL
);--> statement-breakpoint
CREATE INDEX `idx_work_snapshot_owner` ON `work_snapshots` (`member_id`,`shift_id`,`created_at`);

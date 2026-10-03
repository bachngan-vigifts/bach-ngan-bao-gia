CREATE TABLE `staff_members` (
	`id` text PRIMARY KEY NOT NULL,
	`identity_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'employee' NOT NULL,
	`position_id` text,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`position_id`) REFERENCES `staff_positions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_email` ON `staff_members` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_members_identity` ON `staff_members` (`identity_id`);--> statement-breakpoint
CREATE INDEX `idx_members_position` ON `staff_members` (`position_id`);--> statement-breakpoint
CREATE TABLE `staff_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_positions_name` ON `staff_positions` (`name`);--> statement-breakpoint
CREATE TABLE `staff_quotations` (
	`id` text PRIMARY KEY NOT NULL,
	`creator_id` text NOT NULL,
	`quote_no` text NOT NULL,
	`quote_type` text NOT NULL,
	`customer` text NOT NULL,
	`data` text NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`creator_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_quotations_creator_updated` ON `staff_quotations` (`creator_id`,`updated_at`);
CREATE TABLE `staff_quote_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`quote_id` text NOT NULL,
	`actor_id` text NOT NULL,
	`event_type` text NOT NULL,
	`quote_no` text NOT NULL,
	`customer` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_quote_notifications_created` ON `staff_quote_notifications` (`created_at`);
--> statement-breakpoint
CREATE TABLE `staff_notification_reads` (
	`notification_id` text NOT NULL,
	`member_id` text NOT NULL,
	`read_at` text NOT NULL,
	PRIMARY KEY(`notification_id`, `member_id`)
);

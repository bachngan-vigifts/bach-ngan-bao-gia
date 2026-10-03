CREATE TABLE `staff_web_push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`user_agent` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	`last_seen_at` text,
	`disabled_at` text,
	`failure_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_web_push_endpoint` ON `staff_web_push_subscriptions` (`endpoint`);
--> statement-breakpoint
CREATE INDEX `idx_web_push_member` ON `staff_web_push_subscriptions` (`member_id`,`disabled_at`);
--> statement-breakpoint
CREATE TABLE `staff_web_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`event_type` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text NOT NULL,
	`target_role` text DEFAULT 'manager',
	`target_member_id` text,
	`actor_id` text,
	`data_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_web_notifications_created` ON `staff_web_notifications` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_web_notifications_target` ON `staff_web_notifications` (`target_role`,`target_member_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `staff_web_notification_reads` (
	`notification_id` text NOT NULL,
	`member_id` text NOT NULL,
	`read_at` text NOT NULL,
	PRIMARY KEY(`notification_id`, `member_id`)
);

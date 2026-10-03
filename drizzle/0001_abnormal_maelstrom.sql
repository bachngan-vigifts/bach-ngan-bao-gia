CREATE TABLE `staff_auth_attempts` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_attempts_expires` ON `staff_auth_attempts` (`expires`);--> statement-breakpoint
CREATE TABLE `staff_credentials` (
	`member_id` text PRIMARY KEY NOT NULL,
	`password_hash` text,
	`activation_hash` text,
	`activation_expires` integer,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `staff_sessions` (
	`hash` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`version` integer NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_member` ON `staff_sessions` (`member_id`);--> statement-breakpoint
CREATE INDEX `idx_sessions_expires` ON `staff_sessions` (`expires`);--> statement-breakpoint
CREATE TABLE `staff_setup` (
	`id` text PRIMARY KEY NOT NULL
);

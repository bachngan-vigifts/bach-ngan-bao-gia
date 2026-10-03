CREATE TABLE `work_cash_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`shift_id` text NOT NULL,
	`member_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`reviewed_by` text,
	`review_note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`shift_id`) REFERENCES `work_shifts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`member_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_work_cash_requests_shift` ON `work_cash_requests` (`shift_id`,`status`);
CREATE TABLE `staff_sapo_links` (
	`sapo_id` text PRIMARY KEY NOT NULL,
	`member_id` text NOT NULL,
	`created_at` text NOT NULL,
	`evidence` text NOT NULL,
	FOREIGN KEY (`member_id`) REFERENCES `staff_members`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_staff_sapo_member` ON `staff_sapo_links` (`member_id`);
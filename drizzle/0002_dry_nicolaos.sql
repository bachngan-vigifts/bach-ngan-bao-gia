CREATE TABLE `sapo_customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`contact` text NOT NULL,
	`phone` text NOT NULL,
	`email` text NOT NULL,
	`address` text NOT NULL,
	`search` text NOT NULL,
	`source_version` integer NOT NULL,
	`synced_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sapo_customers_name` ON `sapo_customers` (`name`);
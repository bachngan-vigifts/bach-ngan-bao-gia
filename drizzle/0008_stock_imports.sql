CREATE TABLE `stock_imports` (
	`revision` integer PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`filename` text NOT NULL,
	`observed_at` text NOT NULL,
	`created_at` text NOT NULL,
	`created_by` text NOT NULL,
	`count` integer NOT NULL
);

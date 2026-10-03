CREATE TABLE `sapo_order_statuses` (
  `quote_number` text PRIMARY KEY NOT NULL,
  `status` text NOT NULL,
  `sapo_order_id` text,
  `sapo_order_code` text,
  `customer_name` text,
  `message` text,
  `payload_json` text,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sapo_order_statuses_updated` ON `sapo_order_statuses` (`updated_at`);

CREATE TABLE `contract_statuses` (
  `quote_number` text PRIMARY KEY NOT NULL,
  `contract_number` text,
  `status` text NOT NULL,
  `crm_row_id` text,
  `crm_url` text,
  `customer_name` text,
  `item_count` integer,
  `message` text,
  `result_json` text NOT NULL,
  `created_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_contract_statuses_updated` ON `contract_statuses` (`updated_at`);

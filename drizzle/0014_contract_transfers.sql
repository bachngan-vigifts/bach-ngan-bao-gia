CREATE TABLE `contract_transfers` (
  `quote_number` text PRIMARY KEY NOT NULL,
  `contract_number` text NOT NULL,
  `contract_url` text,
  `message` text NOT NULL,
  `result_json` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_contract_transfers_updated` ON `contract_transfers` (`updated_at`);

CREATE TABLE `customer_contract_profiles` (
  `customer_id` text PRIMARY KEY NOT NULL,
  `data` text NOT NULL DEFAULT '{}',
  `updated_at` text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
--> statement-breakpoint
CREATE INDEX `idx_customer_contract_profiles_updated` ON `customer_contract_profiles` (`updated_at`);

ALTER TABLE `staff_quotations` ADD COLUMN `quote_date` text;
--> statement-breakpoint
ALTER TABLE `staff_quotations` ADD COLUMN `search_text` text;
--> statement-breakpoint
ALTER TABLE `staff_quotations` ADD COLUMN `contract_number` text;
--> statement-breakpoint
ALTER TABLE `staff_quotations` ADD COLUMN `contract_quote_no` text;
--> statement-breakpoint
ALTER TABLE `staff_quotations` ADD COLUMN `has_contract` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE INDEX `idx_quotations_created` ON `staff_quotations` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_quotations_quote_date` ON `staff_quotations` (`quote_date`);
--> statement-breakpoint
CREATE INDEX `idx_quotations_contract` ON `staff_quotations` (`contract_number`);
--> statement-breakpoint
CREATE INDEX `idx_quotations_has_contract` ON `staff_quotations` (`has_contract`,`created_at`);

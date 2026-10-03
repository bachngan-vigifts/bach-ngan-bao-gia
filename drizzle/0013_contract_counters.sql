CREATE TABLE `contract_counters` (
  `id` text PRIMARY KEY NOT NULL,
  `type` text NOT NULL,
  `year` integer NOT NULL,
  `month` integer NOT NULL,
  `legal_entity` text NOT NULL,
  `last_sequence` integer NOT NULL,
  `updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contract_counters_period` ON `contract_counters` (`type`,`year`,`month`,`legal_entity`);

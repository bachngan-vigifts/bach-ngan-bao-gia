CREATE TABLE `contract_document_numbers` (
 `quote_number` text NOT NULL,
 `legal_entity` text NOT NULL,
 `contract_number` text NOT NULL,
 PRIMARY KEY (`quote_number`, `legal_entity`)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_contract_document_number` ON `contract_document_numbers` (`contract_number`);

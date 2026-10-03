ALTER TABLE `sapo_customers` ADD `tax_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sapo_customers` ADD `customer_code` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `sapo_customers` ADD `discounts` text DEFAULT '{}' NOT NULL;
CREATE TABLE `crm_tasks` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `details` text NOT NULL DEFAULT '',
  `customer_id` text,
  `quote_number` text,
  `status` text NOT NULL DEFAULT 'open',
  `priority` text NOT NULL DEFAULT 'normal',
  `due_date` text,
  `assigned_to` text NOT NULL,
  `created_by` text NOT NULL,
  `created_at` text NOT NULL,
  `updated_at` text NOT NULL,
  `completed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_crm_tasks_assignee_status` ON `crm_tasks` (`assigned_to`,`status`);
--> statement-breakpoint
CREATE INDEX `idx_crm_tasks_due_date` ON `crm_tasks` (`due_date`);

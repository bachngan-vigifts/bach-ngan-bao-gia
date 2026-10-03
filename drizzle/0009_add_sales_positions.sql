INSERT INTO `staff_positions` (`id`, `name`) VALUES ('sales-ml', 'NVBH ML') ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO `staff_positions` (`id`, `name`) VALUES ('sales-lock', 'NVBH LOCK') ON CONFLICT DO NOTHING;

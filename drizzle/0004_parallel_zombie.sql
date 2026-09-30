ALTER TABLE `accounts` ADD `platform_id` text;--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_platform_id_unique` ON `accounts` (`platform_id`);
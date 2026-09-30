ALTER TABLE `accounts` ADD `phone` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `registrations` ADD `status` text DEFAULT 'attending' NOT NULL;
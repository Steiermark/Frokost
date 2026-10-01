CREATE TABLE `push_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`subscription` text NOT NULL,
	`status` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_once` ON `push_deliveries` (`date`,`subscription`);--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `push_subscriptions_endpoint_unique` ON `push_subscriptions` (`endpoint`);--> statement-breakpoint
CREATE INDEX `push_email` ON `push_subscriptions` (`email`);--> statement-breakpoint
ALTER TABLE `accounts` DROP COLUMN `phone`;
CREATE TABLE `registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`date` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`meal` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `registrations_date_name` ON `registrations` (`date`,`normalized_name`);
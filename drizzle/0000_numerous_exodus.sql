CREATE TABLE `reservations` (
	`id` text PRIMARY KEY NOT NULL,
	`scanner` integer NOT NULL,
	`start` text NOT NULL,
	`end` text NOT NULL,
	`rental_start` text NOT NULL,
	`return_date` text NOT NULL,
	`method` text NOT NULL,
	`days` integer NOT NULL,
	`price` integer NOT NULL,
	`status` text NOT NULL,
	`expires` integer,
	`owner` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`created` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reservation_overlap` ON `reservations` (`scanner`,`start`,`end`);--> statement-breakpoint
CREATE INDEX `reservation_owner` ON `reservations` (`owner`,`status`);
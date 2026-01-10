CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`url` text NOT NULL,
	`company` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`tags` text DEFAULT '[]' NOT NULL,
	`published_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`firecrawl_data` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `posts_url_unique` ON `posts` (`url`);--> statement-breakpoint
CREATE INDEX `url_idx` ON `posts` (`url`);--> statement-breakpoint
CREATE INDEX `company_idx` ON `posts` (`company`);--> statement-breakpoint
CREATE INDEX `status_idx` ON `posts` (`status`);--> statement-breakpoint
CREATE INDEX `published_at_idx` ON `posts` (`published_at`);
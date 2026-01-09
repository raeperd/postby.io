-- Migration: Make published_at column nullable
-- This allows posts to have NULL published_at when date extraction fails

CREATE TABLE `__new_posts` (
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

INSERT INTO `__new_posts`("id", "url", "company", "title", "content", "tags", "published_at", "created_at", "updated_at", "failed_attempts", "status", "firecrawl_data")
SELECT "id", "url", "company", "title", "content", "tags", "published_at", "created_at", "updated_at", "failed_attempts", "status", "firecrawl_data" FROM `posts`;

DROP TABLE `posts`;

ALTER TABLE `__new_posts` RENAME TO `posts`;

CREATE UNIQUE INDEX `posts_url_unique` ON `posts` (`url`);
CREATE INDEX `url_idx` ON `posts` (`url`);
CREATE INDEX `company_idx` ON `posts` (`company`);
CREATE INDEX `status_idx` ON `posts` (`status`);
CREATE INDEX `published_at_idx` ON `posts` (`published_at`);

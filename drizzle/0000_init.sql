CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_email` ON `customers` (`email`);--> statement-breakpoint
CREATE TABLE `guard` (
	`ok` integer NOT NULL,
	CONSTRAINT "guard_ok" CHECK("guard"."ok" = 1)
);
--> statement-breakpoint
CREATE TABLE `line_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_line_id` text NOT NULL,
	`order_id` text NOT NULL,
	`stock_item_id` text NOT NULL,
	FOREIGN KEY (`order_line_id`) REFERENCES `order_lines`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `line_items_stock_item` ON `line_items` (`stock_item_id`);--> statement-breakpoint
CREATE TABLE `order_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `order_lines_product` ON `order_lines` (`product_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`number` integer NOT NULL,
	`invoice_number` integer NOT NULL,
	`customer_id` text NOT NULL,
	`status` text NOT NULL,
	`starts_at` integer NOT NULL,
	`ends_at` integer NOT NULL,
	`discount_type` text DEFAULT 'none' NOT NULL,
	`discount_value` integer DEFAULT 0 NOT NULL,
	`created_by` text,
	`public_token` text,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number` ON `orders` (`number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_invoice_number` ON `orders` (`invoice_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_public_token` ON `orders` (`public_token`);--> statement-breakpoint
CREATE INDEX `orders_period` ON `orders` (`status`,`starts_at`,`ends_at`);--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`method` text DEFAULT '' NOT NULL,
	`paid_on` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `price_tiers` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`days` integer NOT NULL,
	`price_cents` integer NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `price_tiers_product_days` ON `price_tiers` (`product_id`,`days`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`image_key` text,
	`image_type` text,
	`published` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`tracking` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	`pricing_method` text DEFAULT 'daily' NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`deposit_cents` integer DEFAULT 0 NOT NULL,
	`buffer_minutes` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`shop_name` text NOT NULL,
	`currency` text NOT NULL,
	`booking_mode` text NOT NULL,
	`min_notice_hours` integer NOT NULL,
	`contract_terms` text NOT NULL,
	`invoice_due_days` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_items` (
	`id` text PRIMARY KEY NOT NULL,
	`product_id` text NOT NULL,
	`identifier` text NOT NULL,
	`retired` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stock_items_identifier` ON `stock_items` (`product_id`,`identifier`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text DEFAULT (current_timestamp) NOT NULL
);

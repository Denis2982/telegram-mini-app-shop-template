CREATE TABLE "store_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"manual_payment_details" text,
	"pickup_points" text[],
	"currency_code" text,
	"currency_symbol" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

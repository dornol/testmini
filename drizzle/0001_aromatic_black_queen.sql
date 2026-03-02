CREATE TABLE "oidc_account" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider_id" integer NOT NULL,
	"external_id" text NOT NULL,
	"email" text,
	"name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_account_provider_external_unique" UNIQUE("provider_id","external_id")
);
--> statement-breakpoint
CREATE TABLE "oidc_provider" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"provider_type" text DEFAULT 'OIDC' NOT NULL,
	"client_id" text NOT NULL,
	"client_secret_encrypted" text NOT NULL,
	"issuer_url" text,
	"authorization_url" text NOT NULL,
	"token_url" text NOT NULL,
	"userinfo_url" text,
	"scopes" text DEFAULT 'openid profile email' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"auto_register" boolean DEFAULT true NOT NULL,
	"icon_url" text,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oidc_provider_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "oidc_account" ADD CONSTRAINT "oidc_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oidc_account" ADD CONSTRAINT "oidc_account_provider_id_oidc_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."oidc_provider"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oidc_account_user_idx" ON "oidc_account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oidc_account_provider_idx" ON "oidc_account" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "oidc_provider_slug_idx" ON "oidc_provider" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "oidc_provider_enabled_idx" ON "oidc_provider" USING btree ("enabled");
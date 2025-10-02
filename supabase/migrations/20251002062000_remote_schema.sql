


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."auth_role"() RETURNS "text"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select r.slug
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid();
$$;


ALTER FUNCTION "public"."auth_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  insert into public.profiles (id, username, avatar_url, role_id)
  values (
    new.id,
    coalesce( new.raw_user_meta_data->>'user_name'
            , new.raw_user_meta_data->>'full_name'
            , split_part(new.email, '@', 1)
            ),
    new.raw_user_meta_data->>'avatar_url',
    1  -- default: user
  )
  on conflict (id) do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.auth_role() = 'admin';
$$;


ALTER FUNCTION "public"."is_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_moderator_or_admin"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
      and coalesce(r.slug, r.label) in ('moderator','admin')
  );
$$;


ALTER FUNCTION "public"."is_moderator_or_admin"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_role"("p_user" "uuid", "p_role_slug" "text") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if not public.is_admin() then
    raise exception 'Only admins may change roles';
  end if;

  update public.profiles p
     set role_id = r.id
    from public.roles r
   where p.id = p_user
     and r.slug = p_role_slug;
end;
$$;


ALTER FUNCTION "public"."set_user_role"("p_user" "uuid", "p_role_slug" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."touch_items_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end; $$;


ALTER FUNCTION "public"."touch_items_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."enchantments" (
    "id" smallint NOT NULL,
    "code" "text" NOT NULL,
    "label" "text" NOT NULL,
    "max_level" smallint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."enchantments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."enchantments_id_seq"
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."enchantments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."enchantments_id_seq" OWNED BY "public"."enchantments"."id";



CREATE TABLE IF NOT EXISTS "public"."item_enchantments" (
    "item_id" bigint NOT NULL,
    "enchantment_id" smallint NOT NULL,
    "level" smallint DEFAULT 1 NOT NULL
);


ALTER TABLE "public"."item_enchantments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."item_types" (
    "id" smallint NOT NULL,
    "slug" "text" NOT NULL,
    "label" "text" NOT NULL
);


ALTER TABLE "public"."item_types" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."item_types_id_seq"
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."item_types_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."item_types_id_seq" OWNED BY "public"."item_types"."id";



CREATE TABLE IF NOT EXISTS "public"."items" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "lore" "text",
    "owner" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "item_type_id" smallint,
    "material_id" smallint,
    "rarity_id" smallint,
    "stars" smallint,
    "item_image" "text",
    "item_lore_image" "text",
    "created_by" "uuid",
    "is_published" boolean DEFAULT false NOT NULL,
    "name" "text" GENERATED ALWAYS AS ("title") STORED,
    CONSTRAINT "items_stars_check" CHECK ((("stars" >= 0) AND ("stars" <= 3)))
);


ALTER TABLE "public"."items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."items_id_seq" OWNED BY "public"."items"."id";



CREATE TABLE IF NOT EXISTS "public"."materials" (
    "id" smallint NOT NULL,
    "slug" "text" NOT NULL,
    "label" "text" NOT NULL
);


ALTER TABLE "public"."materials" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."materials_id_seq"
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."materials_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."materials_id_seq" OWNED BY "public"."materials"."id";



CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "username" "text",
    "avatar_url" "text",
    "bio" "text",
    "role_id" smallint DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "mc_uuid" "text",
    "mc_name" "text"
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."rarities" (
    "id" smallint NOT NULL,
    "slug" "text" NOT NULL,
    "label" "text" NOT NULL,
    "sort" smallint DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."rarities" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."rarities_id_seq"
    AS smallint
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."rarities_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."rarities_id_seq" OWNED BY "public"."rarities"."id";



CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" smallint NOT NULL,
    "slug" "text" NOT NULL,
    "label" "text" NOT NULL
);


ALTER TABLE "public"."roles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."enchantments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."enchantments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."item_types" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."item_types_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."materials" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."materials_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."rarities" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."rarities_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."enchantments"
    ADD CONSTRAINT "enchantments_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."enchantments"
    ADD CONSTRAINT "enchantments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_enchantments"
    ADD CONSTRAINT "item_enchantments_pkey" PRIMARY KEY ("item_id", "enchantment_id");



ALTER TABLE ONLY "public"."item_types"
    ADD CONSTRAINT "item_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."item_types"
    ADD CONSTRAINT "item_types_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."materials"
    ADD CONSTRAINT "materials_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_mc_name_key" UNIQUE ("mc_name");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_mc_uuid_key" UNIQUE ("mc_uuid");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."rarities"
    ADD CONSTRAINT "rarities_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rarities"
    ADD CONSTRAINT "rarities_slug_key" UNIQUE ("slug");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."roles"
    ADD CONSTRAINT "roles_slug_key" UNIQUE ("slug");



CREATE INDEX "idx_items_item_type_id" ON "public"."items" USING "btree" ("item_type_id");



CREATE INDEX "idx_items_material_id" ON "public"."items" USING "btree" ("material_id");



CREATE INDEX "idx_items_rarity_id" ON "public"."items" USING "btree" ("rarity_id");



CREATE INDEX "idx_items_stars" ON "public"."items" USING "btree" ("stars");



CREATE OR REPLACE TRIGGER "trg_items_touch" BEFORE UPDATE ON "public"."items" FOR EACH ROW EXECUTE FUNCTION "public"."touch_items_updated_at"();



ALTER TABLE ONLY "public"."item_enchantments"
    ADD CONSTRAINT "item_enchantments_enchantment_id_fkey" FOREIGN KEY ("enchantment_id") REFERENCES "public"."enchantments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."item_enchantments"
    ADD CONSTRAINT "item_enchantments_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_item_type_id_fkey" FOREIGN KEY ("item_type_id") REFERENCES "public"."item_types"("id");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "public"."materials"("id");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_owner_fkey" FOREIGN KEY ("owner") REFERENCES "public"."profiles"("id");



ALTER TABLE ONLY "public"."items"
    ADD CONSTRAINT "items_rarity_id_fkey" FOREIGN KEY ("rarity_id") REFERENCES "public"."rarities"("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id");



CREATE POLICY "ench_read_all" ON "public"."enchantments" FOR SELECT TO PUBLIC USING (true);



CREATE POLICY "ench_write_mod" ON "public"."enchantments" TO "authenticated" USING ("public"."is_moderator_or_admin"()) WITH CHECK ("public"."is_moderator_or_admin"());



ALTER TABLE "public"."enchantments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "ien_read_all" ON "public"."item_enchantments" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "ien_write_owner_or_mod" ON "public"."item_enchantments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."items" "i"
  WHERE (("i"."id" = "item_enchantments"."item_id") AND (("i"."created_by" = "auth"."uid"()) OR "public"."is_moderator_or_admin"()))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."items" "i"
  WHERE (("i"."id" = "item_enchantments"."item_id") AND (("i"."created_by" = "auth"."uid"()) OR "public"."is_moderator_or_admin"())))));



ALTER TABLE "public"."item_enchantments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."item_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "item_types_read_all" ON "public"."item_types" FOR SELECT TO PUBLIC USING (true);



CREATE POLICY "item_types_write_mod" ON "public"."item_types" TO "authenticated" USING ("public"."is_moderator_or_admin"()) WITH CHECK ("public"."is_moderator_or_admin"());



ALTER TABLE "public"."items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "items_delete" ON "public"."items" FOR DELETE USING ((("created_by" = "auth"."uid"()) OR "public"."is_moderator_or_admin"()));



CREATE POLICY "items_delete_mod_or_admin" ON "public"."items" FOR DELETE TO "authenticated" USING ("public"."is_moderator_or_admin"());



CREATE POLICY "items_insert_own" ON "public"."items" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND ((NOT "is_published") OR "public"."is_moderator_or_admin"())));



CREATE POLICY "items_read" ON "public"."items" FOR SELECT USING (("is_published" OR ("created_by" = "auth"."uid"()) OR "public"."is_moderator_or_admin"()));



CREATE POLICY "items_read_all" ON "public"."items" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "items_select_own" ON "public"."items" FOR SELECT TO "authenticated" USING (("created_by" = "auth"."uid"()));



CREATE POLICY "items_update_owner_or_mod" ON "public"."items" FOR UPDATE TO "authenticated" USING ((("owner" = "auth"."uid"()) OR "public"."is_moderator_or_admin"())) WITH CHECK ((("owner" = "auth"."uid"()) OR "public"."is_moderator_or_admin"()));



CREATE POLICY "items_write" ON "public"."items" FOR UPDATE USING ((("created_by" = "auth"."uid"()) OR "public"."is_moderator_or_admin"())) WITH CHECK ((("created_by" = "auth"."uid"()) OR "public"."is_moderator_or_admin"()));



ALTER TABLE "public"."materials" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "materials_read_all" ON "public"."materials" FOR SELECT TO PUBLIC USING (true);



CREATE POLICY "materials_write_mod" ON "public"."materials" TO "authenticated" USING ("public"."is_moderator_or_admin"()) WITH CHECK ("public"."is_moderator_or_admin"());



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "profiles_admin_all" ON "public"."profiles" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "profiles_read_all" ON "public"."profiles" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "profiles_update_self" ON "public"."profiles" FOR UPDATE TO "authenticated" USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."rarities" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "rarities_read_all" ON "public"."rarities" FOR SELECT TO PUBLIC USING (true);



CREATE POLICY "rarities_write_mod" ON "public"."rarities" TO "authenticated" USING ("public"."is_moderator_or_admin"()) WITH CHECK ("public"."is_moderator_or_admin"());



ALTER TABLE "public"."roles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "roles_admin_write" ON "public"."roles" TO "authenticated" USING ("public"."is_admin"()) WITH CHECK ("public"."is_admin"());



CREATE POLICY "roles_select_all" ON "public"."roles" FOR SELECT TO "authenticated" USING (true);





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."auth_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."auth_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."auth_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_moderator_or_admin"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_moderator_or_admin"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_moderator_or_admin"() TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_role"("p_user" "uuid", "p_role_slug" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_role"("p_user" "uuid", "p_role_slug" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_role"("p_user" "uuid", "p_role_slug" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."touch_items_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_items_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_items_updated_at"() TO "service_role";


















GRANT ALL ON TABLE "public"."enchantments" TO "anon";
GRANT ALL ON TABLE "public"."enchantments" TO "authenticated";
GRANT ALL ON TABLE "public"."enchantments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."enchantments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."enchantments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."enchantments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."item_enchantments" TO "anon";
GRANT ALL ON TABLE "public"."item_enchantments" TO "authenticated";
GRANT ALL ON TABLE "public"."item_enchantments" TO "service_role";



GRANT ALL ON TABLE "public"."item_types" TO "anon";
GRANT ALL ON TABLE "public"."item_types" TO "authenticated";
GRANT ALL ON TABLE "public"."item_types" TO "service_role";



GRANT ALL ON SEQUENCE "public"."item_types_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."item_types_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."item_types_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."items" TO "anon";
GRANT ALL ON TABLE "public"."items" TO "authenticated";
GRANT ALL ON TABLE "public"."items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."materials" TO "anon";
GRANT ALL ON TABLE "public"."materials" TO "authenticated";
GRANT ALL ON TABLE "public"."materials" TO "service_role";



GRANT ALL ON SEQUENCE "public"."materials_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."materials_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."materials_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."rarities" TO "anon";
GRANT ALL ON TABLE "public"."rarities" TO "authenticated";
GRANT ALL ON TABLE "public"."rarities" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rarities_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rarities_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rarities_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."roles" TO "anon";
GRANT ALL ON TABLE "public"."roles" TO "authenticated";
GRANT ALL ON TABLE "public"."roles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































RESET ALL;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();


  create policy "storage_delete_item_media_owner_or_mods"
  on "storage"."objects"
  as permissive
  for delete
  to authenticated
using (((bucket_id = 'item-media'::text) AND ((owner = auth.uid()) OR is_moderator_or_admin())));



  create policy "storage_insert_item_media"
  on "storage"."objects"
  as permissive
  for insert
  to authenticated
with check ((bucket_id = 'item-media'::text));



  create policy "storage_read_item_media"
  on "storage"."objects"
  as permissive
  for select
  to public
using ((bucket_id = 'item-media'::text));



  create policy "storage_update_item_media_owner_or_mods"
  on "storage"."objects"
  as permissive
  for update
  to authenticated
using (((bucket_id = 'item-media'::text) AND ((owner = auth.uid()) OR is_moderator_or_admin())))
with check (((bucket_id = 'item-media'::text) AND ((owner = auth.uid()) OR is_moderator_or_admin())));




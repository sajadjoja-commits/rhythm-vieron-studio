# Vireon Supabase migrations

Apply migrations to the Supabase project referenced by `supabase/config.toml`.

The core migration creates `profiles` and `projects`, enables RLS, restricts records to the authenticated owner, and creates a profile row when a new auth user is created.

After applying migrations, regenerate `src/integrations/supabase/types.ts` from the live database with the Supabase CLI. Do not commit service-role credentials or OAuth secrets.

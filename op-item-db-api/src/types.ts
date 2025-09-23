import type { SupabaseClient } from '@supabase/supabase-js'

export type MetaEnv = {
  Bindings: {
    SUPABASE_URL: string
    SUPABASE_ANON_KEY: string
    SUPABASE_SERVICE_ROLE_KEY: string
  }
  Variables: {
    supabase?: SupabaseClient
  }
}

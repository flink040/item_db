import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import type { CookieOptions } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

type ServerSupabaseClient = SupabaseClient<any, any, any, any, any>;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Supabase server client requires NEXT_PUBLIC_SUPABASE_URL to be set.');
}

const supabaseKey = supabaseServiceRoleKey ?? supabaseAnonKey;

if (!supabaseKey) {
  throw new Error('Supabase server client requires either SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY.');
}

export const getSupabaseServerClient = async (): Promise<ServerSupabaseClient> => {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: CookieOptions = {}) {
        try {
          cookieStore.set({ name, value, ...options });
        } catch (error) {
          console.error('Failed to set Supabase auth cookie:', error);
        }
      },
      remove(name: string, options: CookieOptions = {}) {
        try {
          cookieStore.delete({ name, ...options });
        } catch (error) {
          console.error('Failed to remove Supabase auth cookie:', error);
        }
      }
    }
  });
};

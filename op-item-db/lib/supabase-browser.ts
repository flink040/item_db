'use client';

import { createBrowserClient } from '@supabase/ssr';

import type { SupabaseClient } from '@supabase/supabase-js';

type BrowserSupabaseClient = SupabaseClient<any, any, any, any, any>;

let browserClient: BrowserSupabaseClient | null = null;

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase browser client is missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY environment variables.'
  );
}

export const getSupabaseBrowserClient = (): BrowserSupabaseClient => {
  if (!browserClient) {
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase browser client cannot be initialised without URL and anon key.');
    }

    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce'
      }
    });
  }

  return browserClient;
};

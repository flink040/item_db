import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?bundle'

function readSupabaseCredentials() {
  if (typeof document === 'undefined') {
    return { url: null, anonKey: null }
  }

  const meta = document.querySelector('meta[name="supabase"]')
  const url = meta?.dataset?.url?.trim() || null
  const anonKey = meta?.dataset?.key?.trim() || null

  return { url, anonKey }
}

const { url, anonKey } = readSupabaseCredentials()

if (!url || !anonKey) {
  console.error('[supabase] SUPABASE_URL oder SUPABASE_ANON_KEY fehlt. Bitte Meta-Tags prüfen.')
}

export const supabase = url && anonKey
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export function getSupabaseClient() {
  return supabase
}

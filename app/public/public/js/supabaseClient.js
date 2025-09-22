import { createClient } from 'https://esm.sh/@supabase/supabase-js@2?bundle'

function readSupabaseCredentials() {
  if (typeof window === 'undefined') {
    return { url: null, anonKey: null }
  }

  const globalScope = window
  const env =
    globalScope && globalScope.__ENV && typeof globalScope.__ENV === 'object'
      ? globalScope.__ENV
      : {}

  const envUrl =
    (typeof env.VITE_SUPABASE_URL === 'string' && env.VITE_SUPABASE_URL.trim()) || null
  const envAnonKey =
    (typeof env.VITE_SUPABASE_ANON_KEY === 'string' && env.VITE_SUPABASE_ANON_KEY.trim()) || null

  if (envUrl && envAnonKey) {
    return { url: envUrl, anonKey: envAnonKey }
  }

  if (typeof document === 'undefined') {
    return { url: envUrl, anonKey: envAnonKey }
  }

  const meta = document.querySelector('meta[name="supabase"]')
  const url = envUrl || meta?.dataset?.url?.trim() || null
  const anonKey = envAnonKey || meta?.dataset?.key?.trim() || null

  return { url, anonKey }
}

const { url, anonKey } = readSupabaseCredentials()

if (!url || !anonKey) {
  console.error(
    '[supabase] SUPABASE_URL oder SUPABASE_ANON_KEY fehlt. Prüfe `app/public/env.js` oder ergänze die Fallback-Meta-Tags.',
  )
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

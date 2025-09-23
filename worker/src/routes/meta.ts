import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'

export const meta = new Hono()

const cors = { 'Access-Control-Allow-Origin': '*', 'content-type': 'application/json' }

type MaybeSupabase = {
  from: (table: string) => any
}

function resolveSupabaseClient(c: any): MaybeSupabase {
  const deps = (c.get('deps') ?? {}) as { supabase?: MaybeSupabase }
  const existing =
    deps.supabase ??
    (c.get('supabase') as MaybeSupabase | undefined) ??
    ((c.env as any)?.supabase as MaybeSupabase | undefined)

  if (existing && typeof existing.from === 'function') {
    return existing
  }

  const url: string | undefined = (c.env as any)?.SUPABASE_URL
  const serviceKey: string | undefined = (c.env as any)?.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase credentials are not configured')
  }

  const client = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) as MaybeSupabase
  c.set('supabase', client)
  return client
}

async function list(c: any, table: string) {
  let client: MaybeSupabase
  try {
    client = resolveSupabaseClient(c)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Supabase client unavailable'
    return c.json({ error: message }, 500, cors)
  }

  try {
    const { data, error } = await client
      .from(table)
      .select('id, slug, label, sort')
      .order('sort', { ascending: true })
    if (error) {
      return c.json({ error: error.message }, 500, cors)
    }
    return c.json(data ?? [], 200, cors)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: message }, 500, cors)
  }
}

meta.get('/rarities', (c) => list(c, 'rarities'))
meta.get('/item_types', (c) => list(c, 'item_types'))
meta.get('/materials', (c) => list(c, 'materials'))

export default meta

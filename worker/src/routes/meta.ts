import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createClient } from '@supabase/supabase-js'
const meta = new Hono<{ Bindings: {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
} }>()


// CORS
meta.use('/*', cors({
  origin: '*',
  allowMethods: ['GET', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  maxAge: 86400
}))

// Helper: Supabase Client
function sb(c: any) {
  return createClient(c.env.SUPABASE_URL, c.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  })
}

// Materials
meta.get('/materials', async (c) => {
  const supabase = sb(c)
  const { data, error } = await supabase
    .from('materials')
    .select('id, slug, label')
    .order('label', { ascending: true })
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data ?? [], 200, {
    'cache-control': 'public, max-age=300, stale-while-revalidate=300'
  })
})

// Item Types
meta.get('/item_types', async (c) => {
  const supabase = sb(c)
  const { data, error } = await supabase
    .from('item_types')
    .select('id, slug, label')
    .order('label', { ascending: true })
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data ?? [], 200, {
    'cache-control': 'public, max-age=300, stale-while-revalidate=300'
  })
})

// Rarities (nach sort, dann label)
meta.get('/rarities', async (c) => {
  const supabase = sb(c)
  const query = supabase
    .from('rarities')
    .select('id, slug, label, sort')
    .order('sort', { ascending: true })
    .order('label', { ascending: true })
  const { data, error } = await query
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data ?? [], 200, {
    'cache-control': 'public, max-age=300, stale-while-revalidate=300'
  })
})

export default meta

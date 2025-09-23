// src/routes/meta.ts
import { Hono } from 'hono'
import type { MetaEnv } from '../types'
import { createClient } from '@supabase/supabase-js'

const meta = new Hono<MetaEnv>()

function sb(c: any) {
  return createClient(
    c.env.SUPABASE_URL,
    c.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  )
}

meta.get('/materials', async (c) => {
  const { data, error } = await sb(c).from('materials')
    .select('id, slug, label')
    .order('label', { ascending: true })
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data ?? [], 200, { 'cache-control': 'public, max-age=300, stale-while-revalidate=300' })
})

meta.get('/item_types', async (c) => {
  const { data, error } = await sb(c).from('item_types')
    .select('id, slug, label')
    .order('label', { ascending: true })
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data ?? [], 200, { 'cache-control': 'public, max-age=300, stale-while-revalidate=300' })
})

meta.get('/rarities', async (c) => {
  const { data, error } = await sb(c).from('rarities')
    .select('id, slug, label, sort')
    .order('sort', { ascending: true })
    .order('label', { ascending: true })
  if (error) return c.json({ error: error.message }, 500)
  return c.json(data ?? [], 200, { 'cache-control': 'public, max-age=300, stale-while-revalidate=300' })
})

export default meta

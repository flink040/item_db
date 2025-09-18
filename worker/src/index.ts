import { Hono } from 'hono'
import { z } from 'zod'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  // CACHE?: KVNamespace // optional, wenn du KV Cache nutzt
}

const app = new Hono<{ Bindings: Bindings }>()

// Healthcheck
app.get('/api/health', (c) => c.json({ ok: true }))

// GET /api/items
app.get('/api/items', async (c) => {
  const url = `${c.env.SUPABASE_URL}/rest/v1/items?select=*`
  const res = await fetch(url, {
    headers: { apikey: c.env.SUPABASE_ANON_KEY }
  })

  if (!res.ok) return c.json({ error: 'supabase_error' }, res.status)

  return c.json(await res.json(), 200, {
    'cache-control': 'public, max-age=60, stale-while-revalidate=120'
  })
})

// POST /api/items (validiert + Service-Role)
const itemSchema = z.object({
  name: z.string().min(3),
  description: z.string().optional(),
  rarity: z.enum(['common', 'rare', 'epic', 'legendary']).optional()
})

app.post('/api/items', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  const parsed = itemSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ error: 'validation', issues: parsed.error.issues }, 400)
  }

  const res = await fetch(`${c.env.SUPABASE_URL}/rest/v1/items`, {
    method: 'POST',
    headers: {
      apikey: c.env.SUPABASE_SERVICE_ROLE_KEY,
      authorization: `Bearer ${c.env.SUPABASE_SERVICE_ROLE_KEY}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(parsed.data)
  })

  if (!res.ok) return c.json({ error: 'supabase_error' }, res.status)
  return c.json(await res.json(), 201)
})

// GET /api/enchantments (lange cachen)
app.get('/api/enchantments', async (c) => {
  const res = await fetch(`${c.env.SUPABASE_URL}/rest/v1/enchantments?select=*`, {
    headers: { apikey: c.env.SUPABASE_ANON_KEY }
  })

  if (!res.ok) return c.json({ error: 'supabase_error' }, res.status)

  return c.json(await res.json(), 200, {
    'cache-control': 'public, max-age=3600, stale-while-revalidate=86400'
  })
})

export default app

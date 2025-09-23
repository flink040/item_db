import { Hono } from 'hono'
import type { MetaEnv } from './types'
import meta from './routes/meta'

const app = new Hono<MetaEnv>()

app.get('/api/health', c => c.text('ok'))

// Diagnose – leakt keine Werte, nur Booleans
app.get('/api/diag', c => {
  const e = c.env as any
  return c.json({
    hasUrl: !!e.SUPABASE_URL,
    hasAnon: !!e.SUPABASE_ANON_KEY,
    hasSrv: !!e.SUPABASE_SERVICE_ROLE_KEY,
  })
})

// Schöneres Fehler-Logging für 500er
app.onError((err, c) => {
  console.error('[onError]', err)
  return c.json({ error: (err as Error).message ?? 'Internal Error' }, 500)
})


app.route('/api', meta)

export default app

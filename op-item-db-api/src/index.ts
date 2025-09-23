// src/index.ts
import { Hono } from 'hono'
import type { MetaEnv } from './types'
import meta from './routes/meta'

const app = new Hono<MetaEnv>()

// optionaler Healthcheck
app.get('/api/health', c => c.text('ok'))

// WICHTIG: meta unter /api mounten -> /api/materials|item_types|rarities
app.route('/api', meta)

// nur EIN Default-Export!
export default app

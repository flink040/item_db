import { Hono } from 'hono'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

type Bindings = {
  SUPABASE_URL: string
  SUPABASE_ANON_KEY: string
  SUPABASE_SERVICE_ROLE_KEY: string
  // CACHE?: KVNamespace // optional, wenn du KV Cache nutzt
}

type SupabaseClient = ReturnType<typeof createClient<any, any>>

const SUPPORTED_RARITIES = ['common', 'rare', 'epic', 'legendary'] as const
const MAX_STAR_RATING = 3

type RequestLike = {
  header(name: string): string | undefined
}

const SUPABASE_AUTH_COOKIE_NAMES = new Set([
  'sb-access-token',
  'sb:token',
  'sb-token',
  'supabase-access-token',
  'supabase-auth-token',
])

const BEARER_PREFIX = /^bearer\s+/i

const readHeader = (req: RequestLike, name: string) =>
  req.header(name) ?? req.header(name.toLowerCase()) ?? req.header(name.toUpperCase())

const decodeCookieValue = (value: string) => {
  try {
    return decodeURIComponent(value)
  } catch (error) {
    void error
    return value
  }
}

const cleanupCookieToken = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) {
    return ''
  }
  const unquoted = trimmed.replace(/^"|"$/g, '')
  return unquoted.trim()
}

const isSupabaseAccessTokenCookie = (name: string) => {
  const normalized = name.trim().toLowerCase()
  if (!normalized) {
    return false
  }
  if (SUPABASE_AUTH_COOKIE_NAMES.has(normalized)) {
    return true
  }
  if (normalized.endsWith('-access-token')) {
    return true
  }
  return normalized.includes('supabase') && normalized.includes('access') && normalized.includes('token')
}

const extractSupabaseTokenFromCookieHeader = (cookieHeader: string | undefined) => {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return null
  }

  const segments = cookieHeader.split(';')
  for (const segment of segments) {
    const separatorIndex = segment.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }
    const name = segment.slice(0, separatorIndex).trim()
    if (!isSupabaseAccessTokenCookie(name)) {
      continue
    }

    const rawValue = segment.slice(separatorIndex + 1)
    const decoded = decodeCookieValue(rawValue)
    const cleaned = cleanupCookieToken(decoded)
    if (cleaned) {
      return cleaned
    }
  }

  return null
}

const normalizeAuthorizationHeaderValue = (value: string | undefined) => {
  if (!value) {
    return null
  }
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }
  return BEARER_PREFIX.test(trimmed) ? trimmed : `Bearer ${trimmed}`
}

const resolveSupabaseBearerToken = (req: RequestLike) => {
  const headerValue = readHeader(req, 'authorization')
  if (typeof headerValue === 'string' && headerValue.trim()) {
    const match = headerValue.match(BEARER_PREFIX)
    if (match) {
      const tokenPart = headerValue.slice(match[0].length).trim()
      if (tokenPart) {
        return tokenPart
      }
    } else {
      return headerValue.trim()
    }
  }

  const cookieHeader = readHeader(req, 'cookie')
  const cookieToken = extractSupabaseTokenFromCookieHeader(cookieHeader)
  return cookieToken
}

const resolveSupabaseAuthorizationHeader = (req: RequestLike) => {
  const headerValue = normalizeAuthorizationHeaderValue(readHeader(req, 'authorization'))
  if (headerValue) {
    return headerValue
  }

  const cookieHeader = readHeader(req, 'cookie')
  const cookieToken = extractSupabaseTokenFromCookieHeader(cookieHeader)
  if (cookieToken) {
    return normalizeAuthorizationHeaderValue(`Bearer ${cookieToken}`)
  }

  return null
}

const integerFromUnknown = (opts: { min?: number; max?: number; positive?: boolean; nonNegative?: boolean } = {}) =>
  z.preprocess((value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) {
        return undefined
      }
      const parsed = Number.parseInt(trimmed, 10)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }

    return value
  }, (() => {
    let schema = z.number().int()
    if (opts.positive) {
      schema = schema.positive()
    }
    if (opts.nonNegative) {
      schema = schema.min(0)
    }
    if (typeof opts.min === 'number') {
      schema = schema.min(opts.min)
    }
    if (typeof opts.max === 'number') {
      schema = schema.max(opts.max)
    }
    return schema
  })())

const enchantmentSchema = z
  .object({
    id: integerFromUnknown({ positive: true }),
    level: integerFromUnknown({ min: 1, max: 10 }),
  })
  .strict()

const itemSchema = z
  .object({
    name: z.string().trim().min(3).max(160).optional(),
    title: z.string().trim().min(3).max(160).optional(),
    description: z.string().trim().max(4000).optional(),
    lore: z.string().trim().max(4000).optional(),
    rarity: z.enum(SUPPORTED_RARITIES).optional(),
    rarity_id: integerFromUnknown({ positive: true }).optional(),
    item_type_id: integerFromUnknown({ positive: true }),
    material_id: integerFromUnknown({ positive: true }),
    star_level: integerFromUnknown({ nonNegative: true, max: MAX_STAR_RATING }).optional(),
    stars: integerFromUnknown({ nonNegative: true, max: MAX_STAR_RATING }).optional(),
    image_url: z.string().trim().url().max(2048).optional(),
    lore_image_url: z.string().trim().url().max(2048).optional(),
    item_image: z.string().trim().url().max(2048).optional(),
    item_lore_image: z.string().trim().url().max(2048).optional(),
    enchantments: z.array(enchantmentSchema).max(64).optional(),
    is_published: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    const resolvedName = (data.name ?? data.title)?.trim()
    if (!resolvedName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['name'],
        message: 'Name (oder Titel) wird benötigt.',
      })
    }

    if (!data.rarity && typeof data.rarity_id !== 'number') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['rarity'],
        message: 'Seltenheit muss angegeben werden.',
      })
    }
  })

function createSupabaseAdminClient(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function verifyUser(client: SupabaseClient, token: string) {
  const { data, error } = await client.auth.getUser(token)
  if (error) {
    throw Object.assign(new Error('auth_failed'), { cause: error })
  }

  if (!data?.user) {
    throw new Error('auth_required')
  }

  return data.user
}

function normaliseItemPayload(payload: z.infer<typeof itemSchema>) {
  const name = (payload.name ?? payload.title ?? '').trim()
  const starLevel =
    typeof payload.star_level === 'number'
      ? payload.star_level
      : typeof payload.stars === 'number'
        ? payload.stars
        : 0
  const normalizedStarLevel = Math.max(0, Math.min(starLevel, MAX_STAR_RATING))

  const itemImage = payload.item_image ?? payload.image_url ?? null
  const itemLoreImage = payload.item_lore_image ?? payload.lore_image_url ?? null

  return {
    name,
    description: (payload.description ?? payload.lore ?? '').trim() || null,
    rarity_id: typeof payload.rarity_id === 'number' ? payload.rarity_id : null,
    rarity: payload.rarity ?? null,
    item_type_id: payload.item_type_id,
    material_id: payload.material_id,
    star_level: normalizedStarLevel,
    item_image: itemImage,
    item_lore_image: itemLoreImage,
    enchantments: payload.enchantments ?? [],
    is_published: payload.is_published === true,
  }
}

async function validateEnchantments(
  client: SupabaseClient,
  enchantments: Array<{ id: number; level: number }>
) {
  if (!enchantments.length) {
    return []
  }

  const uniqueIds = new Map<number, number>()
  const duplicates = new Set<number>()

  enchantments.forEach((entry) => {
    const current = uniqueIds.get(entry.id)
    if (typeof current === 'number') {
      duplicates.add(entry.id)
    }
    uniqueIds.set(entry.id, entry.level)
  })

  if (duplicates.size > 0) {
    const duplicateList = Array.from(duplicates).join(', ')
    throw Object.assign(new Error(`Duplicate enchantment IDs: ${duplicateList}`), {
      status: 400,
      reason: 'duplicate_enchantments',
    })
  }

  const { data, error } = await client
    .from('enchantments')
    .select('id,max_level')
    .in('id', Array.from(uniqueIds.keys()))

  if (error) {
    throw Object.assign(new Error('enchantment_lookup_failed'), { cause: error })
  }

  const known = new Map<number, { max_level: number | null }>()
  data?.forEach((row) => {
    if (typeof row.id === 'number') {
      known.set(row.id, { max_level: typeof row.max_level === 'number' ? row.max_level : null })
    }
  })

  const missing = Array.from(uniqueIds.keys()).filter((id) => !known.has(id))
  if (missing.length) {
    throw Object.assign(new Error(`Unbekannte Verzauberung(en): ${missing.join(', ')}`), {
      status: 400,
      reason: 'unknown_enchantment',
    })
  }

  const violations: Array<{ id: number; max: number; received: number }> = []
  uniqueIds.forEach((level, id) => {
    const meta = known.get(id)
    if (!meta) {
      return
    }
    const max = typeof meta.max_level === 'number' && meta.max_level > 0 ? meta.max_level : null
    if (max !== null && level > max) {
      violations.push({ id, max, received: level })
    }
  })

  if (violations.length) {
    throw Object.assign(
      new Error(
        violations
          .map((entry) => `Verzauberung ${entry.id}: Level ${entry.received} > erlaubt ${entry.max}`)
          .join(', ')
      ),
      {
        status: 400,
        reason: 'enchantment_level_invalid',
      }
    )
  }

  return enchantments.map((entry) => ({
    enchantment_id: entry.id,
    level: entry.level,
  }))
}

async function insertItemWithEnchantments(
  client: SupabaseClient,
  item: {
    title?: string
    name?: string
    description?: string | null
    item_type_id: number
    material_id: number
    rarity_id: number | null
    rarity?: string | null
    stars?: number
    star_level?: number
    created_by: string
    item_image?: string | null
    item_lore_image?: string | null
    is_published: boolean
  },
  enchantments: Array<{ enchantment_id: number; level: number }>
) {

  const resolvedStars =
    typeof item.star_level === 'number'
      ? item.star_level
      : typeof item.stars === 'number'
        ? item.stars
        : 0

  const buildPayloadVariant = (starColumn: 'stars' | 'star_level', useLegacyFallback: boolean) => {
    const payload: Record<string, unknown> = {
      is_published: item.is_published,
      item_type_id: item.item_type_id,
      material_id: item.material_id,
    }

    if (starColumn === 'star_level') {
      payload.star_level = resolvedStars
    } else {
      payload.stars = resolvedStars
    }

    if (item.title) {
      payload.title = item.title
    }

    if (item.item_image !== undefined) {
      payload.item_image = item.item_image
    }

    if (item.item_lore_image !== undefined) {
      payload.item_lore_image = item.item_lore_image
    }

    if (item.rarity_id !== null) {
      payload.rarity_id = item.rarity_id
    }

    if (item.description !== undefined) {
      payload.lore = item.description
      if (!useLegacyFallback) {
        payload.description = item.description
      }
    }

    if (useLegacyFallback) {
      payload.owner = item.created_by
    } else {
      payload.created_by = item.created_by
      if (item.name) {
        payload.name = item.name
      }
      if (item.rarity) {
        payload.rarity = item.rarity
      }
    }

    return payload
  }

  const executeInsert = async (starColumn: 'stars' | 'star_level', useLegacyFallback: boolean) =>
    client.from('items').insert(buildPayloadVariant(starColumn, useLegacyFallback)).select().single()

  const starColumns: Array<'stars' | 'star_level'> = ['stars', 'star_level']
  let itemResult: Awaited<ReturnType<typeof executeInsert>> | null = null
  let lastError: unknown = null

  for (const starColumn of starColumns) {
    let result = await executeInsert(starColumn, false)
    if (!result.error && result.data) {
      itemResult = result
      break
    }

    lastError = result.error ?? null

    const message = String(result.error?.message ?? '').toLowerCase()
    const missingStarColumn =
      message.includes('column "stars"') || message.includes('column items.stars')
    const legacyColumnErrors = ['name', 'description', 'rarity']
    const hasLegacyIssue = legacyColumnErrors.some((column) => message.includes(`column "${column}`))
    if (hasLegacyIssue) {
      result = await executeInsert(starColumn, true)
      if (!result.error && result.data) {
        itemResult = result
        break
      }
      lastError = result.error ?? null
    }

    if (starColumn === 'stars' && !missingStarColumn) {
      break
    }
  }

  if (!itemResult || itemResult.error || !itemResult.data) {
    throw Object.assign(new Error('item_insert_failed'), { cause: itemResult?.error ?? lastError })
  }

  const insertedItem = { ...itemResult.data } as Record<string, unknown> & {
    stars?: number | null
    star_level?: number | null
  }

  const derivedStars =
    typeof insertedItem.stars === 'number'
      ? insertedItem.stars
      : typeof insertedItem.star_level === 'number'
        ? insertedItem.star_level
        : resolvedStars

  insertedItem.stars = derivedStars
  if (typeof insertedItem.star_level !== 'number') {
    insertedItem.star_level = derivedStars
  }

  if (!enchantments.length) {
    return { item: insertedItem, enchantments: [] }
  }

  const enchantPayload = enchantments.map((entry) => ({
    ...entry,
    item_id: insertedItem.id,
  }))

  const { error: enchantError, data: enchantRows } = await client
    .from('item_enchantments')
    .insert(enchantPayload)

  if (enchantError) {
    await client.from('items').delete().eq('id', insertedItem.id)
    throw Object.assign(new Error('enchant_insert_failed'), { cause: enchantError })
  }

  return {
    item: insertedItem,
    enchantments: enchantRows ?? enchantPayload,
  }
}

const app = new Hono<{ Bindings: Bindings }>()

const sanitizeSearchValue = (value: string) =>
  value
    .trim()
    .replace(/[*,%]/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const normalizeFilterValue = (value: string | undefined) => value?.trim() ?? ''

const extractPositiveIntegerFilter = (
  ...candidates: Array<string | undefined>
): string | null => {
  for (const candidate of candidates) {
    const normalized = normalizeFilterValue(candidate)
    if (!normalized) {
      continue
    }

    const parsed = Number.parseInt(normalized, 10)
    if (Number.isInteger(parsed) && parsed > 0) {
      return String(parsed)
    }
  }

  return null
}

// Healthcheck
app.get('/api/health', (c) => c.json({ ok: true }))

// GET /api/items
app.get('/api/items', async (c) => {
  const query = c.req.query()
  const params = new URLSearchParams({ select: '*' })

  const search = sanitizeSearchValue(query.search ?? '')
  const rarity = normalizeFilterValue(query.rarity)
  const itemTypeFilter = extractPositiveIntegerFilter(
    query['item_type_id'],
    query['type_id'],
    query['typeId'],
    query.type
  )
  const materialFilter = extractPositiveIntegerFilter(
    query['material_id'],
    query['materialId'],
    query.material
  )
  const rarityIdFilter = extractPositiveIntegerFilter(query['rarity_id'], query['rarityId'])

  if (search.length > 0) {
    const pattern = `*${search}*`
    params.set(
      'or',
      `(name.ilike.${pattern},slug.ilike.${pattern},description.ilike.${pattern})`
    )
  }

  if (itemTypeFilter) {
    params.append('item_type_id', `eq.${itemTypeFilter}`)
  }

  if (materialFilter) {
    params.append('material_id', `eq.${materialFilter}`)
  }

  if (rarityIdFilter) {
    params.append('rarity_id', `eq.${rarityIdFilter}`)
  } else if (rarity) {
    params.append('rarity', `eq.${rarity}`)
  }

  params.append('order', 'name.asc')

  const url = `${c.env.SUPABASE_URL}/rest/v1/items?${params.toString()}`
  const supabaseHeaders: Record<string, string> = { apikey: c.env.SUPABASE_ANON_KEY }
  const forwardedAuthHeader = resolveSupabaseAuthorizationHeader(c.req)
  if (forwardedAuthHeader) {
    supabaseHeaders.Authorization = forwardedAuthHeader
  }
  const res = await fetch(url, {
    headers: supabaseHeaders,
  })

  if (!res.ok) return c.json({ error: 'supabase_error' }, res.status as any)

  return c.json(await res.json(), 200, {
    'cache-control': 'public, max-age=60, stale-while-revalidate=120'
  })
})

// POST /api/items (validiert + Service-Role)
app.post('/api/items', async (c) => {
  const token = resolveSupabaseBearerToken(c.req)

  if (!token) {
    return c.json({ error: 'auth_required', message: 'Bitte mit einem gültigen Supabase-Token anfragen.' }, 401)
  }

  const adminClient = createSupabaseAdminClient(c.env)

  let user
  try {
    user = await verifyUser(adminClient, token)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'auth_failed'
    return c.json({ error: 'auth_failed', reason }, 401)
  }

  const rawBody = await c.req.json().catch(() => ({}))
  const parsed = itemSchema.safeParse(rawBody)

  if (!parsed.success) {
    return c.json({ error: 'validation', issues: parsed.error.issues }, 400)
  }

  const normalized = normaliseItemPayload(parsed.data)

  if (!normalized.rarity_id && !normalized.rarity) {
    return c.json({
      error: 'validation',
      issues: [
        {
          path: ['rarity'],
          message: 'Seltenheit konnte nicht bestimmt werden.',
        },
      ],
    }, 400)
  }

  const enchantments = await validateEnchantments(adminClient, normalized.enchantments)

  const dryRun = ['1', 'true', 'yes'].includes((c.req.query('dryRun') || '').toLowerCase())

  const baseItem = {
    title: normalized.name,
    name: normalized.name,
    description: normalized.description,
    item_type_id: normalized.item_type_id,
    material_id: normalized.material_id,
    rarity_id: normalized.rarity_id ?? null,
    rarity: normalized.rarity ?? null,
    stars: normalized.star_level,
    star_level: normalized.star_level,
    created_by: user.id,
    item_image: normalized.item_image ?? undefined,
    item_lore_image: normalized.item_lore_image ?? undefined,
    is_published: normalized.is_published,
  }

  if (dryRun) {
    return c.json(
      {
        ok: true,
        dryRun: true,
        item: baseItem,
        enchantments,
        user: { id: user.id },
      },
      200
    )
  }

  try {
    const inserted = await insertItemWithEnchantments(adminClient, baseItem, enchantments)
    return c.json({ ...inserted, owner: user.id, method: 'bff' }, 201)
  } catch (error) {
    if (error && typeof error === 'object' && 'status' in error && typeof error.status === 'number') {
      const status = error.status as number
      const message = error instanceof Error ? error.message : 'Speichern fehlgeschlagen.'
      return c.json({ error: 'validation', message }, status as any)
    }

    const message = error instanceof Error ? error.message : 'Speichern fehlgeschlagen.'
    return c.json({ error: 'supabase_error', message }, 500)
  }
})

// GET /api/enchantments (lange cachen)
app.get('/api/enchantments', async (c) => {
  const res = await fetch(`${c.env.SUPABASE_URL}/rest/v1/enchantments?select=*`, {
    headers: { apikey: c.env.SUPABASE_ANON_KEY }
  })

  if (!res.ok) return c.json({ error: 'supabase_error' }, res.status as any)

  return c.json(await res.json(), 200, {
    'cache-control': 'public, max-age=3600, stale-while-revalidate=86400'
  })
})

export default app

import { Hono } from 'hono'
import type { Context } from 'hono'
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'
import type { Bindings } from './bindings'
import { fetchItemTypesList, fetchMaterialsList, fetchRaritiesList } from './routes/meta'
import { ItemInsertSchema, type ItemInsert, coerceInts } from './schemas'

type SupabaseClient = ReturnType<typeof createClient<any, any>>

// Cloudflare's runtime sometimes expects a global `meta` object to exist when
// evaluating module workers. The Windows deploy reported a `ReferenceError`
// because the identifier wasn't defined at load time, so we provide a safe
// default here. To mirror the behaviour of Wrangler's bundler we also ensure a
// hoisted `var meta` binding exists alongside the global property.
declare global {
  // eslint-disable-next-line no-var
  var meta: unknown | undefined
}

const globalWithMeta = globalThis as typeof globalThis & { meta?: unknown }

if (typeof globalWithMeta.meta === 'undefined') {
  globalWithMeta.meta = {}
}

if (typeof meta === 'undefined') {
  // eslint-disable-next-line no-var
  var meta = globalWithMeta.meta
} else if (globalWithMeta.meta !== meta) {
  globalWithMeta.meta = meta
}

const MAX_STAR_RATING = 3

type RequestLike = {
  header(name: string): string | undefined
}

type RequestWithBody = RequestLike & {
  text(): Promise<string>
}

const SUPABASE_AUTH_COOKIE_NAMES = new Set([
  'sb-access-token',
  'sb:token',
  'sb-token',
  'supabase-access-token',
  'supabase-auth-token',
])

const BEARER_PREFIX = /^bearer\s+/i

const KNOWN_ROLES = ['user', 'moderator', 'admin'] as const
type KnownRole = (typeof KNOWN_ROLES)[number]
type UserRole = KnownRole | null
const KNOWN_ROLE_SET = new Set<string>(KNOWN_ROLES)
const MODERATION_ROLES = new Set<KnownRole>(['moderator', 'admin'])

const readHeader = (req: RequestLike, name: string) =>
  req.header(name) ?? req.header(name.toLowerCase()) ?? req.header(name.toUpperCase())

const normalizeRoleValue = (value: unknown): UserRole => {
  if (typeof value !== 'string') {
    return null
  }

  const normalized = value.trim().toLowerCase()
  return KNOWN_ROLE_SET.has(normalized) ? (normalized as KnownRole) : null
}

const isModeratorRole = (role: UserRole) => (role ? MODERATION_ROLES.has(role) : false)

const maskUserId = (value: string | null | undefined) => {
  if (typeof value !== 'string') {
    return null
  }

  const cleaned = value.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12)
  return cleaned ? `uid_${cleaned}` : null
}

type RouteLogPayload = {
  method: string
  status: number
  durationMs: number
  cacheStatus?: string | null
  user?: string | null
  message?: string
}

const logRouteEvent = (scope: string, payload: RouteLogPayload) => {
  console.log(`[worker:${scope}]`, payload)
}

const SENSITIVE_HEADER_NAMES = new Set([
  'authorization',
  'cookie',
  'x-api-key',
  'cf-access-jwt-assertion',
])

const shouldRedactHeader = (name: string) => {
  const lowered = name.toLowerCase()
  if (SENSITIVE_HEADER_NAMES.has(lowered)) {
    return true
  }

  if (lowered.startsWith('x-auth-') || lowered.endsWith('-token') || lowered.includes('authorization')) {
    return true
  }

  return false
}

const JSON_ERROR_CONTEXT_RADIUS = 20

const computeLineAndColumn = (source: string, index: number) => {
  const preceding = source.slice(0, index)
  const lines = preceding.split(/\r\n|[\n\r]/)
  const line = lines.length
  const column = (lines[lines.length - 1]?.length ?? 0) + 1
  return { line, column }
}

const createJsonErrorContext = (source: string, position: number) => {
  const start = Math.max(0, position - JSON_ERROR_CONTEXT_RADIUS)
  const end = Math.min(source.length, position + JSON_ERROR_CONTEXT_RADIUS)
  const fragment = source.slice(start, end)
  return { fragment, pointer: position - start }
}

type JsonParseSuccess = {
  success: true
  data: unknown
  rawText: string
}

type JsonParseFailure = {
  success: false
  status: number
  body: {
    error: string
    message: string
    details?: Record<string, unknown>
  }
}

const describeJsonParseError = (
  error: unknown,
  rawBody: string,
  contentType: string | undefined
): { message: string; details?: Record<string, unknown> } => {
  const baseMessage = 'Ungültiger JSON-Body. Bitte gültiges JSON senden.'
  const details: Record<string, unknown> = {}

  if (contentType && contentType.trim()) {
    details.contentType = contentType
  }

  if (error instanceof SyntaxError) {
    details.reason = error.message
    const match = error.message.match(/position\s+(\d+)/i)
    if (match) {
      const position = Number.parseInt(match[1], 10)
      if (Number.isFinite(position)) {
        const { line, column } = computeLineAndColumn(rawBody, position)
        const { fragment, pointer } = createJsonErrorContext(rawBody, position)
        details.offset = position
        details.position = position + 1
        details.line = line
        details.column = column
        details.fragment = fragment
        details.fragmentPointer = pointer
        return {
          message: `${baseMessage} Syntaxfehler bei Zeichen ${position + 1} (Zeile ${line}, Spalte ${column}).`,
          details,
        }
      }
    }
    return {
      message: `${baseMessage} ${error.message}.`,
      details,
    }
  }

  if (error instanceof Error && error.message) {
    details.reason = error.message
    return {
      message: `${baseMessage} ${error.message}.`,
      details,
    }
  }

  return {
    message: baseMessage,
    details: Object.keys(details).length ? details : undefined,
  }
}

const parseJsonBody = async (
  req: RequestWithBody
): Promise<JsonParseSuccess | JsonParseFailure> => {
  let rawText: string
  try {
    rawText = await req.text()
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'Unbekannter Fehler beim Lesen des Request-Bodys.'
    return {
      success: false,
      status: 400,
      body: {
        error: 'invalid_json',
        message: 'Request-Body konnte nicht gelesen werden.',
        details: { reason },
      },
    }
  }

  if (!rawText.trim()) {
    return { success: true, data: {}, rawText }
  }

  try {
    const parsed = JSON.parse(rawText)
    return { success: true, data: parsed, rawText }
  } catch (error) {
    const contentType = readHeader(req, 'content-type')
    const isLikelyJsonContentType =
      typeof contentType === 'string' && /json|\+json/i.test(contentType)

    const { message, details } = describeJsonParseError(error, rawText, contentType)
    const detailObject: Record<string, unknown> = details ? { ...details } : {}

    if (!isLikelyJsonContentType) {
      detailObject.expectedContentType = 'application/json'
      detailObject.receivedContentType =
        typeof contentType === 'string' && contentType.trim() ? contentType : null
    }

    const body: JsonParseFailure['body'] = {
      error: 'invalid_json',
      message,
    }

    if (Object.keys(detailObject).length) {
      body.details = detailObject
    }

    return {
      success: false,
      status: 400,
      body,
    }
  }
}

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

  const unquoted = trimmed.replace(/^"|"$/g, '').trim()
  if (!unquoted) {
    return ''
  }

  const looksLikeJsonObject = unquoted.startsWith('{') && unquoted.endsWith('}')
  const looksLikeJsonArray = unquoted.startsWith('[') && unquoted.endsWith(']')

  if (looksLikeJsonObject || looksLikeJsonArray) {
    try {
      const parsed = JSON.parse(unquoted) as Record<string, unknown> | null
      if (parsed && typeof parsed === 'object') {
        const tokenCandidate =
          typeof parsed.access_token === 'string'
            ? parsed.access_token
            : typeof parsed.accessToken === 'string'
              ? parsed.accessToken
              : typeof parsed.token === 'string'
                ? parsed.token
                : null

        if (tokenCandidate && tokenCandidate.trim()) {
          return tokenCandidate.trim()
        }
      }
    } catch (error) {
      console.warn('[worker:auth:cookie]', 'Failed to parse Supabase cookie payload.', error)
    }

    return ''
  }

  if (unquoted.startsWith('{') || unquoted.includes('"access_token"')) {
    return ''
  }

  return unquoted
}

const isSupabaseAccessTokenCookie = (name: string) => {
  const normalized = name.trim().toLowerCase()
  if (!normalized) {
    return false
  }
  const base = normalized.replace(/\.[0-9]+$/, '')
  if (SUPABASE_AUTH_COOKIE_NAMES.has(normalized) || SUPABASE_AUTH_COOKIE_NAMES.has(base)) {
    return true
  }
  if (normalized.endsWith('-access-token') || normalized.endsWith('-auth-token')) {
    return true
  }
  if (base.endsWith('-access-token') || base.endsWith('-auth-token')) {
    return true
  }
  if (base.startsWith('sb-') && base.includes('auth') && base.includes('token')) {
    return true
  }
  if (base.includes('supabase') && base.includes('token')) {
    return true
  }
  return false
}

const extractSupabaseTokenFromCookieHeader = (cookieHeader: string | undefined) => {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return null
  }

  const candidateParts = new Map<
    string,
    { parts: Array<{ index: number; value: string }>; originalNames: Set<string> }
  >()

  const segments = cookieHeader.split(';')
  for (const segment of segments) {
    const separatorIndex = segment.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const rawName = segment.slice(0, separatorIndex).trim()
    if (!rawName) {
      continue
    }

    const baseName = rawName.replace(/\.[0-9]+$/, '')
    if (!isSupabaseAccessTokenCookie(rawName) && !isSupabaseAccessTokenCookie(baseName)) {
      continue
    }

    const indexMatch = rawName.match(/\.([0-9]+)$/)
    const partIndex = indexMatch ? Number.parseInt(indexMatch[1] ?? '0', 10) : 0
    if (!Number.isFinite(partIndex) || partIndex < 0) {
      continue
    }

    const rawValue = segment.slice(separatorIndex + 1)
    const decoded = decodeCookieValue(rawValue)
    if (!decoded || !decoded.trim()) {
      continue
    }

    const entry = candidateParts.get(baseName) ?? { parts: [], originalNames: new Set<string>() }
    entry.parts.push({ index: partIndex, value: decoded })
    entry.originalNames.add(rawName)
    candidateParts.set(baseName, entry)
  }

  for (const { parts } of candidateParts.values()) {
    if (parts.length === 0) {
      continue
    }

    parts.sort((a, b) => a.index - b.index)
    const combined = parts.map((part) => part.value).join('')
    const cleaned = cleanupCookieToken(combined)
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

const ROLE_METADATA_KEYS = [
  'role',
  'user_role',
  'userRole',
  'role_slug',
  'roleSlug',
  'role_name',
  'roleName',
  'role_id',
  'roleId',
] as const

const resolveRoleFromMetadata = (metadata: Record<string, unknown> | null | undefined): UserRole => {
  if (!metadata || typeof metadata !== 'object') {
    return null
  }

  for (const key of ROLE_METADATA_KEYS) {
    if (key in metadata) {
      const normalized = normalizeRoleValue((metadata as Record<string, unknown>)[key])
      if (normalized) {
        return normalized
      }
    }
  }

  return null
}

function createSupabaseAdminClient(env: Bindings): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

const supabaseAdminClientCache = new WeakMap<Bindings, SupabaseClient>()

function getCachedSupabaseAdminClient(env: Bindings): SupabaseClient {
  let client = supabaseAdminClientCache.get(env)
  if (!client) {
    client = createSupabaseAdminClient(env)
    supabaseAdminClientCache.set(env, client)
  }
  return client
}

function createSupabaseUserClient(env: Bindings, accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: env.SUPABASE_ANON_KEY,
      },
    },
  })
}

async function fetchProfileRole(client: SupabaseClient, userId: string): Promise<UserRole> {
  const { data, error, status } = await client
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .limit(1)
    .maybeSingle()

  if (error) {
    if (status === 406 || status === 404) {
      return null
    }
    throw Object.assign(new Error('profile_role_lookup_failed'), { cause: error })
  }

  return normalizeRoleValue(data?.role)
}

async function resolveUserRole(client: SupabaseClient, user: User): Promise<UserRole> {
  const profileRole = await fetchProfileRole(client, user.id)
  if (profileRole) {
    return profileRole
  }

  const userMetadataRole = resolveRoleFromMetadata(
    (user.user_metadata ?? null) as Record<string, unknown> | null
  )
  if (userMetadataRole) {
    return userMetadataRole
  }

  return resolveRoleFromMetadata((user.app_metadata ?? null) as Record<string, unknown> | null)
}

type AuthSuccess = {
  token: string
  adminClient: SupabaseClient
  user: User
  role: UserRole
}

type AuthFailure = { response: Response }

const isAuthFailure = (value: AuthSuccess | AuthFailure): value is AuthFailure => 'response' in value

async function authenticateRequest(
  c: Context<{ Bindings: Bindings }>,
  { requireModerator = false }: { requireModerator?: boolean } = {}
): Promise<AuthSuccess | AuthFailure> {
  const token = resolveSupabaseBearerToken(c.req)
  if (!token) {
    return {
      response: c.json(
        { error: 'auth_required', message: 'Bitte mit einem gültigen Supabase-Token anfragen.' },
        401,
        cors()
      ),
    }
  }

  const adminClient = getCachedSupabaseAdminClient(c.env)

  let user: User
  try {
    user = await verifyUser(adminClient, token)
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'auth_failed'
    return { response: c.json({ error: 'auth_failed', reason }, 401, cors()) }
  }

  let role: UserRole
  try {
    role = await resolveUserRole(adminClient, user)
  } catch (error) {
    console.error('[worker:auth:role]', error)
    return {
      response: c.json(
        { error: 'profile_lookup_failed', message: 'Rolle konnte nicht ermittelt werden.' },
        500,
        cors()
      ),
    }
  }

  if (requireModerator && !isModeratorRole(role)) {
    return {
      response: c.json(
        { error: 'forbidden', message: 'Moderatorrechte erforderlich.' },
        403,
        cors()
      ),
    }
  }

  return { token, adminClient, user, role }
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

const pickFirstString = (...candidates: Array<unknown>) => {
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') {
      continue
    }

    const trimmed = candidate.trim()
    if (trimmed) {
      return trimmed
    }
  }

  return null
}

const normalizeStarLevel = (value: number | null | undefined) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0
  }

  const rounded = Math.round(value)
  if (!Number.isFinite(rounded)) {
    return 0
  }

  return Math.max(0, Math.min(MAX_STAR_RATING, rounded))
}

const normalizeEnchantments = (
  enchantments: ItemInsert['enchantments']
): Array<{ enchantment_id: number; level: number }> => {
  if (!Array.isArray(enchantments)) {
    return []
  }

  return enchantments
    .map((entry) => ({
      enchantment_id: entry.enchantment_id,
      level: entry.level,
    }))
    .filter(
      (entry) =>
        Number.isInteger(entry.enchantment_id) &&
        entry.enchantment_id > 0 &&
        Number.isInteger(entry.level) &&
        entry.level > 0
    )
}

function normaliseItemPayload(payload: ItemInsert, rawBody: Record<string, unknown>) {
  const title = payload.title.trim()
  const starLevel = normalizeStarLevel(payload.star_level)
  const description = pickFirstString(
    payload.description ?? undefined,
    rawBody.description,
    rawBody.lore,
    rawBody.item_description,
    rawBody.itemDescription
  )

  const itemImage =
    pickFirstString(
      payload.image_url ?? undefined,
      rawBody.image_url,
      rawBody.imageUrl,
      rawBody.item_image,
      rawBody.itemImage,
      rawBody.image
    ) ?? null

  const itemLoreImage =
    pickFirstString(
      rawBody.lore_image_url,
      rawBody.loreImageUrl,
      rawBody.item_lore_image,
      rawBody.itemLoreImage
    ) ?? null

  const name = pickFirstString(rawBody.name, rawBody.title, title) ?? title

  return {
    title,
    name,
    description: description ?? null,
    item_type_id: payload.item_type_id,
    material_id: payload.material_id,
    rarity_id: payload.rarity_id,
    star_level: starLevel,
    item_image: itemImage,
    image_url: itemImage,
    item_lore_image: itemLoreImage,
    enchantments: normalizeEnchantments(payload.enchantments),
    is_published: payload.is_published === true,
  }
}

async function validateEnchantments(
  client: SupabaseClient,
  enchantments: Array<{ enchantment_id: number; level: number }>
) {
  if (!enchantments.length) {
    return []
  }

  const uniqueIds = new Map<number, number>()
  const duplicates = new Set<number>()

  enchantments.forEach((entry) => {
    const id = entry.enchantment_id
    const level = entry.level

    if (!Number.isInteger(id) || id <= 0) {
      return
    }

    if (!Number.isInteger(level) || level <= 0) {
      return
    }

    const current = uniqueIds.get(id)
    if (typeof current === 'number') {
      duplicates.add(id)
    }
    uniqueIds.set(id, level)
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

  return enchantments
    .filter((entry) => uniqueIds.has(entry.enchantment_id))
    .map((entry) => ({
      enchantment_id: entry.enchantment_id,
      level: entry.level,
    }))
}

type InsertedItemWithEnchantments = {
  item: Record<string, unknown> & { id: number | string }
  enchantments: Array<Record<string, unknown>>
}

const buildItemSnapshot = (
  result: InsertedItemWithEnchantments
): { item: Record<string, unknown>; enchantments: Array<Record<string, unknown>> } => {
  const item = result.item
  const snapshotItem: Record<string, unknown> = {}
  const fieldsToPersist = [
    'id',
    'title',
    'name',
    'description',
    'item_type_id',
    'material_id',
    'rarity_id',
    'stars',
    'star_level',
    'created_by',
    'item_image',
    'item_lore_image',
    'is_published',
    'slug',
  ]

  for (const key of fieldsToPersist) {
    if (key in item) {
      snapshotItem[key] = (item as Record<string, unknown>)[key]
    }
  }

  const enchantments = result.enchantments.map((entry) => ({
    enchantment_id: (entry as Record<string, unknown>).enchantment_id ?? null,
    level: (entry as Record<string, unknown>).level ?? null,
  }))

  return { item: snapshotItem, enchantments }
}

async function createItemVersionRecord(
  client: SupabaseClient,
  payload: { itemId: number | string; snapshot: Record<string, unknown>; changedBy: string }
) {
  const { error } = await client.from('item_versions').insert({
    item_id: payload.itemId,
    snapshot: payload.snapshot,
    changed_by: payload.changedBy,
  })

  if (error) {
    throw Object.assign(new Error('item_version_insert_failed'), { cause: error })
  }
}

async function createAuditLogEntry(
  client: SupabaseClient,
  payload: {
    actor: string
    action: string
    entity: string
    entityId: string | number
    meta?: Record<string, unknown>
  }
) {
  const { error } = await client.from('audit_log').insert({
    actor: payload.actor,
    action: payload.action,
    entity: payload.entity,
    entity_id: String(payload.entityId),
    meta: payload.meta ?? null,
  })

  if (error) {
    throw Object.assign(new Error('audit_log_insert_failed'), { cause: error })
  }
}

async function rollbackItemCreation(client: SupabaseClient, itemId: number | string) {
  try {
    await client.from('item_enchantments').delete().eq('item_id', itemId)
  } catch (error) {
    console.error('[worker:items:rollback:enchantments]', error)
  }

  try {
    await client.from('items').delete().eq('id', itemId)
  } catch (error) {
    console.error('[worker:items:rollback:item]', error)
  }
}

async function insertItemWithEnchantments(
  client: SupabaseClient,
  item: {
    title: string
    name?: string | null
    description?: string | null
    item_type_id: number
    material_id: number
    rarity_id: number | null
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

    if (!useLegacyFallback) {
      const resolvedName = item.name ?? item.title
      if (resolvedName) {
        payload.name = resolvedName
      }
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
    const legacyColumnErrors = ['description', 'rarity', 'name', 'created_by']
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
const api = app.basePath('/api')

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

const extractBooleanFilter = (
  ...candidates: Array<string | undefined>
): 'true' | 'false' | null => {
  for (const candidate of candidates) {
    const normalized = normalizeFilterValue(candidate)
    if (!normalized) {
      continue
    }

    const lowered = normalized.toLowerCase()

    if (['true', '1', 'yes', 'y', 'on'].includes(lowered)) {
      return 'true'
    }

    if (['false', '0', 'no', 'n', 'off'].includes(lowered)) {
      return 'false'
    }
  }

  return null
}

const DEFAULT_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

const cors = (overrides: Record<string, string> = {}) => ({
  ...DEFAULT_CORS_HEADERS,
  'content-type': 'application/json',
  ...overrides,
})

const handleMetaError = (
  c: Context<{ Bindings: Bindings }>,
  scope: string,
  error: unknown,
  fallbackMessage: string
) => {
  console.error(`[worker:meta:${scope}]`, error)
  const status =
    typeof (error as { status?: number } | null)?.status === 'number'
      ? (error as { status?: number }).status
      : 500
  const message =
    error instanceof Error && error.message ? error.message : fallbackMessage

  return c.json({ error: message }, status as any, cors())
}

const META_CACHE_HEADERS = {
  'cache-control': 'public, max-age=300, stale-while-revalidate=300',
}

// Healthcheck
api.get('/health', (c) => c.text('ok'))

// Quick diagnostics for environment configuration
api.get('/diag', async (c) => {
  const start = Date.now()
  const auth = await authenticateRequest(c, { requireModerator: true })

  if (isAuthFailure(auth)) {
    logRouteEvent('api:diag', {
      method: 'GET',
      status: auth.response.status,
      durationMs: Date.now() - start,
      user: null,
    })
    return auth.response
  }

  const env = c.env
  const maskedUser = maskUserId(auth.user.id)
  const headers = cors({ 'cache-control': 'no-store' })
  const response = c.json(
    {
      hasUrl: !!env.SUPABASE_URL,
      hasAnon: !!env.SUPABASE_ANON_KEY,
      hasSrv: !!env.SUPABASE_SERVICE_ROLE_KEY,
    },
    200,
    headers
  )

  logRouteEvent('api:diag', {
    method: 'GET',
    status: 200,
    durationMs: Date.now() - start,
    user: maskedUser,
  })

  return response
})

// Debug echo endpoint (nur Moderatoren, sensible Header redacted)
api.all('/debug/echo', async (c) => {
  const start = Date.now()
  const auth = await authenticateRequest(c, { requireModerator: true })

  if (isAuthFailure(auth)) {
    logRouteEvent('api:debug:echo', {
      method: c.req.method,
      status: auth.response.status,
      durationMs: Date.now() - start,
      user: null,
    })
    return auth.response
  }

  const maskedUser = maskUserId(auth.user.id)

  let rawBody = ''
  try {
    rawBody = await c.req.text()
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : 'Unbekannter Fehler beim Lesen des Request-Bodys.'

    logRouteEvent('api:debug:echo', {
      method: c.req.method,
      status: 400,
      durationMs: Date.now() - start,
      user: maskedUser,
      message: reason,
    })

    return c.json(
      {
        error: 'body_read_failed',
        message: 'Request-Body konnte nicht gelesen werden.',
        details: { reason },
      },
      400,
      cors({ 'cache-control': 'no-store' })
    )
  }

  const trimmed = rawBody.trim()
  let parsedJson: unknown
  let jsonParseError: { message: string; details?: Record<string, unknown> } | undefined

  if (trimmed) {
    try {
      parsedJson = JSON.parse(rawBody)
    } catch (error) {
      const { message, details } = describeJsonParseError(
        error,
        rawBody,
        readHeader(c.req, 'content-type')
      )
      jsonParseError = details ? { message, details } : { message }
    }
  }

  const headersRecord = c.req.header() as Record<string, string>
  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(headersRecord)) {
    headers[key] = shouldRedactHeader(key) ? '[redacted]' : value
  }

  const url = new URL(c.req.url)
  const responsePayload: Record<string, unknown> = {
    ok: true,
    method: c.req.method,
    url: c.req.url,
    path: url.pathname,
    query: c.req.query(),
    queries: c.req.queries(),
    headers,
    body: rawBody,
    bodyLength: rawBody.length,
  }

  if (typeof parsedJson !== 'undefined') {
    responsePayload.json = parsedJson
  }

  if (jsonParseError) {
    responsePayload.jsonParseError = jsonParseError
  }

  logRouteEvent('api:debug:echo', {
    method: c.req.method,
    status: 200,
    durationMs: Date.now() - start,
    user: maskedUser,
  })

  return c.json(responsePayload, 200, cors({ 'cache-control': 'no-store' }))
})

app.options('*', (c) =>
  c.body(null, 204, cors({ 'content-type': 'text/plain; charset=UTF-8', 'Access-Control-Max-Age': '600' }))
)


app.get('/api/materials', async (c) => {
  const start = Date.now()
  const ifNoneMatch = readHeader(c.req, 'if-none-match')
  try {
    const result = await fetchMaterialsList(c.env, { ifNoneMatch })
    const headers = cors({ ...META_CACHE_HEADERS })
    headers.vary = headers.vary ? `${headers.vary}, If-None-Match` : 'If-None-Match'
    if (result.etag) {
      headers.etag = result.etag
    }

    const duration = Date.now() - start
    logRouteEvent('meta:materials', {
      method: 'GET',
      status: result.status,
      durationMs: duration,
    })

    if (result.status === 304) {
      return c.body(null, 304, headers)
    }

    return c.json(result.data, result.status as any, headers)
  } catch (error) {
    const status =
      typeof (error as { status?: number } | null)?.status === 'number'
        ? ((error as { status: number }).status as number)
        : 500

    logRouteEvent('meta:materials', {
      method: 'GET',
      status,
      durationMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'unknown_error',
    })

    return handleMetaError(c, 'materials', error, 'Materialien konnten nicht geladen werden.')
  }
})

app.get('/api/item_types', async (c) => {
  const start = Date.now()
  const ifNoneMatch = readHeader(c.req, 'if-none-match')
  try {
    const result = await fetchItemTypesList(c.env, { ifNoneMatch })
    const headers = cors({ ...META_CACHE_HEADERS })
    headers.vary = headers.vary ? `${headers.vary}, If-None-Match` : 'If-None-Match'
    if (result.etag) {
      headers.etag = result.etag
    }

    const duration = Date.now() - start
    logRouteEvent('meta:item_types', {
      method: 'GET',
      status: result.status,
      durationMs: duration,
    })

    if (result.status === 304) {
      return c.body(null, 304, headers)
    }

    return c.json(result.data, result.status as any, headers)
  } catch (error) {
    const status =
      typeof (error as { status?: number } | null)?.status === 'number'
        ? ((error as { status: number }).status as number)
        : 500

    logRouteEvent('meta:item_types', {
      method: 'GET',
      status,
      durationMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'unknown_error',
    })

    return handleMetaError(c, 'item_types', error, 'Item-Typen konnten nicht geladen werden.')
  }
})

app.get('/api/rarities', async (c) => {
  const start = Date.now()
  const ifNoneMatch = readHeader(c.req, 'if-none-match')
  try {
    const result = await fetchRaritiesList(c.env, { ifNoneMatch })
    const headers = cors({ ...META_CACHE_HEADERS })
    headers.vary = headers.vary ? `${headers.vary}, If-None-Match` : 'If-None-Match'
    if (result.etag) {
      headers.etag = result.etag
    }

    const duration = Date.now() - start
    logRouteEvent('meta:rarities', {
      method: 'GET',
      status: result.status,
      durationMs: duration,
    })

    if (result.status === 304) {
      return c.body(null, 304, headers)
    }

    return c.json(result.data, result.status as any, headers)
  } catch (error) {
    const status =
      typeof (error as { status?: number } | null)?.status === 'number'
        ? ((error as { status: number }).status as number)
        : 500

    logRouteEvent('meta:rarities', {
      method: 'GET',
      status,
      durationMs: Date.now() - start,
      message: error instanceof Error ? error.message : 'unknown_error',
    })

    return handleMetaError(c, 'rarities', error, 'Seltenheiten konnten nicht geladen werden.')
  }
})

// GET /api/items
api.get('/items', async (c) => {
  const query = c.req.query()
  const params = new URLSearchParams({
    select:
      '*,item_enchantments(enchantment_id,level,enchantments(id,label,slug,description,max_level))',
  })

  const search = sanitizeSearchValue(query.search ?? '')
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
  const isPublishedFilter = extractBooleanFilter(
    query['is_published'],
    query['isPublished'],
    query.published,
    query['published']
  )

  if (search.length > 0) {
    const pattern = `*${search}*`
    params.set(
      'or',
      `(title.ilike.${pattern},slug.ilike.${pattern},description.ilike.${pattern})`
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
  }

  if (isPublishedFilter !== null) {
    params.delete('is_published')
    params.append('is_published', `is.${isPublishedFilter}`)
  }

  params.append('order', 'title.asc')

  const url = `${c.env.SUPABASE_URL}/rest/v1/items?${params.toString()}`
  const supabaseHeaders: Record<string, string> = {
    apikey: c.env.SUPABASE_ANON_KEY,
    Accept: 'application/json',
  }
  const forwardedAuthHeader = resolveSupabaseAuthorizationHeader(c.req)
  if (forwardedAuthHeader) {
    supabaseHeaders.Authorization = forwardedAuthHeader
  } else {
    supabaseHeaders.Authorization = `Bearer ${c.env.SUPABASE_ANON_KEY}`
  }

  const ifNoneMatch = readHeader(c.req, 'if-none-match')
  if (ifNoneMatch) {
    supabaseHeaders['If-None-Match'] = ifNoneMatch
  }

  const start = Date.now()
  const res = await fetch(url, {
    headers: supabaseHeaders,
  })

  const etag = res.headers.get('etag')
  const cacheStatus = res.headers.get('cf-cache-status') ?? res.headers.get('x-cache-status')
  const headers = cors({
    'cache-control': 'public, max-age=60, stale-while-revalidate=120',
  })
  headers.vary = 'Authorization, If-None-Match'
  if (etag) {
    headers.etag = etag
  }

  if (res.status === 304) {
    logRouteEvent('api:items:get', {
      method: 'GET',
      status: 304,
      durationMs: Date.now() - start,
      cacheStatus,
    })
    return c.body(null, 304, headers)
  }

  if (!res.ok) {
    logRouteEvent('api:items:get', {
      method: 'GET',
      status: res.status,
      durationMs: Date.now() - start,
      cacheStatus,
      message: res.statusText || 'supabase_error',
    })
    return c.json({ error: 'supabase_error' }, res.status as any, headers)
  }

  const data = await res.json()
  logRouteEvent('api:items:get', {
    method: 'GET',
    status: res.status,
    durationMs: Date.now() - start,
    cacheStatus,
  })

  return c.json(data, res.status as any, headers)
})

// POST /api/items (validiert + RLS-konform)
api.post('/items', async (c) => {
  const start = Date.now()
  const authResult = await authenticateRequest(c)

  if (isAuthFailure(authResult)) {
    logRouteEvent('api:items:post', {
      method: 'POST',
      status: authResult.response.status,
      durationMs: Date.now() - start,
      user: null,
    })
    return authResult.response
  }

  const { token, adminClient, user, role } = authResult
  const maskedUser = maskUserId(user.id)

  const contentType = readHeader(c.req, 'content-type') || ''
  if (!/application\/json/i.test(contentType)) {
    logRouteEvent('api:items:post', {
      method: 'POST',
      status: 415,
      durationMs: Date.now() - start,
      user: maskedUser,
      message: 'unsupported_media_type',
    })
    return c.json(
      {
        error: 'unsupported_media_type',
        message: 'Content-Type must be application/json',
      },
      415,
      cors()
    )
  }

  const bodyResult = await parseJsonBody(c.req)
  if (!bodyResult.success) {
    logRouteEvent('api:items:post', {
      method: 'POST',
      status: bodyResult.status,
      durationMs: Date.now() - start,
      user: maskedUser,
      message: 'invalid_json',
    })
    return c.json(bodyResult.body, bodyResult.status as any, cors())
  }

  const rawBody = bodyResult.data
  if (!rawBody || typeof rawBody !== 'object' || Array.isArray(rawBody)) {
    logRouteEvent('api:items:post', {
      method: 'POST',
      status: 400,
      durationMs: Date.now() - start,
      user: maskedUser,
      message: 'body_not_object',
    })
    return c.json(
      {
        error: 'validation',
        message: 'Request-Body muss ein JSON-Objekt sein.',
      },
      400,
      cors()
    )
  }

  const workingBody: Record<string, unknown> = { ...(rawBody as Record<string, unknown>) }
  coerceInts(workingBody, ['rarity_id', 'item_type_id', 'material_id', 'star_level'])

  if (typeof workingBody.is_published === 'string') {
    const normalized = workingBody.is_published.trim().toLowerCase()
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) {
      workingBody.is_published = true
    } else if (['false', '0', 'no', 'n', 'off'].includes(normalized)) {
      workingBody.is_published = false
    }
  } else if (typeof workingBody.is_published === 'number') {
    workingBody.is_published = workingBody.is_published > 0
  }

  if (Array.isArray(workingBody.enchantments)) {
    workingBody.enchantments = workingBody.enchantments
      .map((entry) => {
        if (!entry || typeof entry !== 'object') {
          return null
        }

        const copy: Record<string, unknown> = { ...entry }
        coerceInts(copy, ['enchantment_id', 'level', 'id'])

        if (typeof copy.enchantment_id !== 'number' && typeof copy.id === 'number') {
          copy.enchantment_id = copy.id
        }

        if (typeof copy.enchantment_id === 'string') {
          const trimmed = copy.enchantment_id.trim()
          if (/^\d+$/.test(trimmed)) {
            copy.enchantment_id = Number.parseInt(trimmed, 10)
          }
        }

        if (typeof copy.level === 'string') {
          const trimmed = copy.level.trim()
          if (/^\d+$/.test(trimmed)) {
            copy.level = Number.parseInt(trimmed, 10)
          }
        }

        if (typeof copy.enchantment_id !== 'number' || typeof copy.level !== 'number') {
          return null
        }

        return { enchantment_id: copy.enchantment_id, level: copy.level }
      })
      .filter((entry): entry is { enchantment_id: number; level: number } => Boolean(entry))
  }

  const parsed = ItemInsertSchema.safeParse(workingBody)
  if (!parsed.success) {
    logRouteEvent('api:items:post', {
      method: 'POST',
      status: 400,
      durationMs: Date.now() - start,
      user: maskedUser,
      message: 'validation_failed',
    })
    return c.json({ error: 'validation', details: parsed.error.format() }, 400, cors())
  }

  const normalized = normaliseItemPayload(parsed.data, workingBody)

  if (!Number.isInteger(normalized.rarity_id) || normalized.rarity_id <= 0) {
    logRouteEvent('api:items:post', {
      method: 'POST',
      status: 400,
      durationMs: Date.now() - start,
      user: maskedUser,
      message: 'rarity_missing',
    })
    return c.json(
      {
        error: 'validation',
        details: {
          rarity_id: { _errors: ['Seltenheit muss angegeben werden.'] },
        },
      },
      400,
      cors()
    )
  }

  if (normalized.is_published && !isModeratorRole(role)) {
    logRouteEvent('api:items:post', {
      method: 'POST',
      status: 403,
      durationMs: Date.now() - start,
      user: maskedUser,
      message: 'publish_forbidden',
    })
    return c.json(
      { error: 'forbidden', message: 'Nur Moderatoren dürfen Items veröffentlichen.' },
      403,
      cors()
    )
  }

  let enchantments: Array<{ enchantment_id: number; level: number }>
  try {
    enchantments = await validateEnchantments(adminClient, normalized.enchantments)
  } catch (error) {
    const status =
      typeof (error as { status?: number } | null)?.status === 'number'
        ? ((error as { status: number }).status as number)
        : 500
    const message = error instanceof Error ? error.message : 'Verzauberungen konnten nicht validiert werden.'

    logRouteEvent('api:items:post', {
      method: 'POST',
      status,
      durationMs: Date.now() - start,
      user: maskedUser,
      message,
    })

    const body =
      status >= 400 && status < 500
        ? { error: 'validation', message }
        : { error: 'supabase_error', message }

    return c.json(body, status as any, cors())
  }

  const dryRun = ['1', 'true', 'yes'].includes((c.req.query('dryRun') || '').toLowerCase())
  const isModerator = isModeratorRole(role)
  const resolvedIsPublished = isModerator ? normalized.is_published : false

  const baseItem = {
    title: normalized.title,
    name: normalized.name ?? normalized.title,
    description: normalized.description,
    item_type_id: normalized.item_type_id,
    material_id: normalized.material_id,
    rarity_id: normalized.rarity_id,
    stars: normalized.star_level,
    star_level: normalized.star_level,
    created_by: user.id,
    item_image: normalized.item_image ?? undefined,
    item_lore_image: normalized.item_lore_image ?? undefined,
    is_published: resolvedIsPublished,
  }

  if (dryRun) {
    logRouteEvent('api:items:post', {
      method: 'POST',
      status: 200,
      durationMs: Date.now() - start,
      user: maskedUser,
      message: 'dry_run',
    })
    return c.json(
      {
        ok: true,
        dryRun: true,
        item: baseItem,
        enchantments,
        user: { id: user.id, role },
      },
      200,
      cors()
    )
  }

  const userClient = createSupabaseUserClient(c.env, token)

  let inserted: InsertedItemWithEnchantments
  try {
    inserted = await insertItemWithEnchantments(userClient, baseItem, enchantments)
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'status' in error && typeof (error as { status?: number }).status === 'number'
        ? ((error as { status: number }).status as number)
        : 500
    const message = error instanceof Error ? error.message : 'Speichern fehlgeschlagen.'

    logRouteEvent('api:items:post', {
      method: 'POST',
      status,
      durationMs: Date.now() - start,
      user: maskedUser,
      message,
    })

    const body =
      status >= 400 && status < 500 ? { error: 'validation', message } : { error: 'supabase_error', message }
    return c.json(body, status as any, cors())
  }

  const snapshot = buildItemSnapshot(inserted)
  try {
    await createItemVersionRecord(adminClient, {
      itemId: inserted.item.id,
      snapshot,
      changedBy: user.id,
    })
    await createAuditLogEntry(adminClient, {
      actor: user.id,
      action: 'item.create',
      entity: 'item',
      entityId: inserted.item.id,
      meta: {
        via: 'worker',
        role,
        is_published: resolvedIsPublished,
      },
    })
  } catch (error) {
    console.error('[worker:items:create:audit]', error)
    await rollbackItemCreation(adminClient, inserted.item.id)

    logRouteEvent('api:items:post', {
      method: 'POST',
      status: 500,
      durationMs: Date.now() - start,
      user: maskedUser,
      message: 'audit_log_failed',
    })

    return c.json(
      { error: 'audit_log_failed', message: 'Item konnte nicht protokolliert werden.' },
      500,
      cors()
    )
  }

  logRouteEvent('api:items:post', {
    method: 'POST',
    status: 201,
    durationMs: Date.now() - start,
    user: maskedUser,
  })

  return c.json({ ...inserted, owner: user.id, method: 'bff' }, 201, cors())
})

// GET /api/enchantments (lange cachen)
api.get('/enchantments', async (c) => {
  const start = Date.now()
  const ifNoneMatch = readHeader(c.req, 'if-none-match')
  const headers: Record<string, string> = {
    apikey: c.env.SUPABASE_ANON_KEY,
    Authorization: `Bearer ${c.env.SUPABASE_ANON_KEY}`,
    Accept: 'application/json',
  }

  if (ifNoneMatch) {
    headers['If-None-Match'] = ifNoneMatch
  }

  const res = await fetch(`${c.env.SUPABASE_URL}/rest/v1/enchantments?select=*`, {
    headers,
  })

  const etag = res.headers.get('etag')
  const cacheStatus = res.headers.get('cf-cache-status') ?? res.headers.get('x-cache-status')
  const responseHeaders = cors({
    'cache-control': 'public, max-age=3600, stale-while-revalidate=86400',
  })
  responseHeaders.vary = 'If-None-Match'
  if (etag) {
    responseHeaders.etag = etag
  }

  if (res.status === 304) {
    logRouteEvent('api:enchantments:get', {
      method: 'GET',
      status: 304,
      durationMs: Date.now() - start,
      cacheStatus,
    })
    return c.body(null, 304, responseHeaders)
  }

  if (!res.ok) {
    logRouteEvent('api:enchantments:get', {
      method: 'GET',
      status: res.status,
      durationMs: Date.now() - start,
      cacheStatus,
      message: res.statusText || 'supabase_error',
    })
    return c.json({ error: 'supabase_error' }, res.status as any, responseHeaders)
  }

  const data = await res.json()
  logRouteEvent('api:enchantments:get', {
    method: 'GET',
    status: res.status,
    durationMs: Date.now() - start,
    cacheStatus,
  })

  return c.json(data, res.status as any, responseHeaders)
})

app.onError((err, c) => {
  console.error('[worker:onError]', err)
  return c.json({ error: (err as Error).message ?? 'Internal Error' }, 500, cors())
})

export default app

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent
} from 'react'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { SVGProps } from 'react'

import logoUrl from './logo.svg'

type FilterOption = {
  value: string
  label: string
  supabaseValue?: string
  supabaseTextValue?: string
}

type Item = {
  id: string
  slug: string
  title: string
  rarity?: string | null
  rarity_id?: number | null
  rarityId?: number | null
  type?: string | null
  item_type_id?: number | null
  itemTypeId?: number | null
  material?: string | null
  material_id?: number | null
  materialId?: number | null
  star_level?: number | null
  description?: string | null
  item_image?: string | null
  image_url?: string | null
  item_lore_image?: string | null
  lore_image_url?: string | null
  item_types?: ReferenceLookup | null
  materials?: ReferenceLookup | null
  rarities?: ReferenceLookup | null
  enchantments?: unknown
  item_enchantments?: unknown
  itemEnchantments?: unknown
}

type ReferenceLookup = {
  id?: number | null
  label?: string | null
  code?: string | null
  slug?: string | null
}

type Enchantment = {
  id: number
  label: string
  slug: string | null
  description: string | null
  maxLevel: number
}

type ImagePreviewDetails = {
  url: string
  title: string
}

const MAX_STAR_LEVEL = 3 as const
const STAR_LEVEL_VALUES = Array.from(
  { length: MAX_STAR_LEVEL + 1 },
  (_, index) => index
) as ReadonlyArray<number>

const SUPABASE_AUTH_COOKIE_HINTS = [
  'sb-access-token',
  'sb:token',
  'sb-token',
  'supabase-access-token',
  'supabase-auth-token',
]

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
  const withoutQuotes = trimmed.replace(/^"|"$/g, '')
  return withoutQuotes.trim()
}

const isLikelySupabaseCookieName = (name: string) => {
  const normalized = name.trim().toLowerCase()
  if (!normalized) {
    return false
  }
  if (SUPABASE_AUTH_COOKIE_HINTS.includes(normalized)) {
    return true
  }
  if (normalized.endsWith('-access-token')) {
    return true
  }
  return normalized.includes('supabase') && normalized.includes('access') && normalized.includes('token')
}

const extractSupabaseAccessTokenFromCookies = (cookieString: string | undefined) => {
  if (!cookieString || typeof cookieString !== 'string') {
    return null
  }

  const segments = cookieString.split(';')
  for (const segment of segments) {
    const separatorIndex = segment.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }
    const name = segment.slice(0, separatorIndex)
    if (!isLikelySupabaseCookieName(name)) {
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

const isLikelyJwt = (value: string) => {
  const parts = value.split('.')
  return parts.length === 3 && parts.every((part) => part.trim().length > 0)
}

const findAccessTokenInObject = (input: unknown, seen = new Set<unknown>()) => {
  if (!input || typeof input !== 'object') {
    return null
  }

  const stack: unknown[] = [input]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current || typeof current !== 'object') {
      continue
    }
    if (seen.has(current)) {
      continue
    }
    seen.add(current)

    if (Array.isArray(current)) {
      for (const value of current) {
        stack.push(value)
      }
      continue
    }

    for (const [key, value] of Object.entries(current)) {
      if (typeof key === 'string') {
        const normalizedKey = key.toLowerCase()
        if (normalizedKey === 'access_token' && typeof value === 'string' && value.trim()) {
          return value.trim()
        }
        if (normalizedKey.includes('access') && normalizedKey.includes('token') && typeof value === 'string' && value.trim()) {
          return value.trim()
        }
      }

      if (value && typeof value === 'object') {
        stack.push(value)
      }
    }
  }

  return null
}

const extractSupabaseTokenFromStorageValue = (value: string | null) => {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  if (isLikelyJwt(trimmed)) {
    return trimmed
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown
    if (typeof parsed === 'string') {
      return parsed.trim() || null
    }
    return findAccessTokenInObject(parsed)
  } catch (error) {
    void error
  }

  return null
}

const getSupabaseAccessTokenFromLocalStorage = () => {
  if (typeof window === 'undefined') {
    return null
  }

  let storage: Storage | null = null
  try {
    storage = window.localStorage
  } catch (error) {
    void error
  }

  if (!storage) {
    return null
  }

  const candidateKeys: string[] = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key) {
      continue
    }
    const normalizedKey = key.toLowerCase()
    if (
      normalizedKey.startsWith('sb-') ||
      normalizedKey.includes('supabase') ||
      normalizedKey.includes('auth') ||
      normalizedKey.includes('token')
    ) {
      candidateKeys.push(key)
    }
  }

  if (!candidateKeys.length) {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key) {
        candidateKeys.push(key)
      }
    }
  }

  for (const key of candidateKeys) {
    let rawValue: string | null = null
    try {
      rawValue = storage.getItem(key)
    } catch (error) {
      void error
    }

    const token = extractSupabaseTokenFromStorageValue(rawValue)
    if (token) {
      return token
    }
  }

  return null
}

const getSupabaseAccessToken = () => {
  if (typeof document !== 'undefined') {
    const cookieToken = extractSupabaseAccessTokenFromCookies(document.cookie)
    if (cookieToken) {
      return cookieToken
    }
  }

  return getSupabaseAccessTokenFromLocalStorage()
}

const SUPABASE_URL =
  typeof import.meta.env?.VITE_SUPABASE_URL === 'string'
    ? import.meta.env.VITE_SUPABASE_URL.trim()
    : ''
const SUPABASE_ANON_KEY =
  typeof import.meta.env?.VITE_SUPABASE_ANON_KEY === 'string'
    ? import.meta.env.VITE_SUPABASE_ANON_KEY.trim()
    : ''

const supabaseClient =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      })
    : null

const getSupabaseClient = () => supabaseClient

const ENCHANTMENT_LEVEL_KEYS = ['level', 'enchantment_level', 'enchantmentLevel', 'lvl', 'value'] as const

const parsePositiveInteger = (value: unknown): number | null => {
  if (typeof value === 'number') {
    if (Number.isInteger(value) && value > 0) {
      return value
    }
    return null
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    const parsed = Number.parseInt(trimmed, 10)
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed
    }
  }

  return null
}

const isLikelyEnchantmentEntry = (entry: unknown) => {
  if (typeof entry === 'string') {
    return entry.trim().length > 0
  }

  if (!entry || typeof entry !== 'object') {
    return false
  }

  const record = entry as Record<string, unknown>
  return ENCHANTMENT_LEVEL_KEYS.some((key) => parsePositiveInteger(record[key]) !== null)
}

const hasEmbeddedEnchantmentData = (item: Item) => {
  const record = item as Record<string, unknown>
  const candidates = [record.item_enchantments, record.itemEnchantments, record.enchantments]

  return candidates.some(
    (candidate) => Array.isArray(candidate) && candidate.some((entry) => isLikelyEnchantmentEntry(entry))
  )
}

const extractNumericItemId = (item: Item): number | null => {
  const record = item as Record<string, unknown>
  const candidates = [record.id, record.item_id, record.itemId]

  for (const candidate of candidates) {
    if (typeof candidate === 'number' && Number.isInteger(candidate) && candidate > 0) {
      return candidate
    }

    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (!trimmed) {
        continue
      }

      const parsed = Number.parseInt(trimmed, 10)
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed
      }
    }
  }

  return null
}

const ensureItemEnchantments = async (items: Item[]): Promise<Item[]> => {
  const supabase = getSupabaseClient()
  if (!supabase) {
    return items
  }

  const missingItemIds: number[] = []
  const seenItemIds = new Set<number>()

  items.forEach((item) => {
    if (hasEmbeddedEnchantmentData(item)) {
      return
    }

    const itemId = extractNumericItemId(item)
    if (itemId === null || seenItemIds.has(itemId)) {
      return
    }

    seenItemIds.add(itemId)
    missingItemIds.push(itemId)
  })

  if (missingItemIds.length === 0) {
    return items
  }

  try {
    const { data, error } = await supabase
      .from('item_enchantments')
      .select('item_id,enchantment_id,level,enchantments(id,label,slug,description,max_level)')
      .in('item_id', missingItemIds)

    if (error) {
      console.warn('Verzauberungen konnten nicht ergänzt werden.', error)
      return items
    }

    if (!Array.isArray(data) || data.length === 0) {
      return items
    }

    const grouped = new Map<number, Array<Record<string, unknown>>>()

    data.forEach((row) => {
      if (!row || typeof row !== 'object') {
        return
      }

      const record = row as Record<string, unknown>
      const rawItemId = record.item_id ?? record.itemId ?? record.item
      let itemId: number | null = null

      if (typeof rawItemId === 'number') {
        itemId = Number.isInteger(rawItemId) && rawItemId > 0 ? rawItemId : null
      } else if (typeof rawItemId === 'string') {
        const trimmed = rawItemId.trim()
        if (trimmed) {
          const parsed = Number.parseInt(trimmed, 10)
          itemId = Number.isInteger(parsed) && parsed > 0 ? parsed : null
        }
      }

      if (itemId === null || !seenItemIds.has(itemId)) {
        return
      }

      const level = ENCHANTMENT_LEVEL_KEYS.reduce<number | null>((acc, key) => {
        if (acc !== null) {
          return acc
        }
        return parsePositiveInteger(record[key])
      }, null)

      if (level === null) {
        return
      }

      const normalized: Record<string, unknown> = { level }

      const enchantmentId = parsePositiveInteger(
        record.enchantment_id ?? record.enchantmentId ?? record.enchant_id
      )
      if (enchantmentId !== null) {
        normalized.enchantment_id = enchantmentId
      }

      const meta = record.enchantments
      if (meta && typeof meta === 'object') {
        normalized.enchantments = meta
      }

      const list = grouped.get(itemId)
      if (list) {
        list.push(normalized)
      } else {
        grouped.set(itemId, [normalized])
      }
    })

    if (!grouped.size) {
      return items
    }

    return items.map((item) => {
      const itemId = extractNumericItemId(item)
      if (itemId === null) {
        return item
      }

      const extra = grouped.get(itemId)
      if (!extra || extra.length === 0) {
        return item
      }

      const next = { ...(item as Record<string, unknown>) }
      next.item_enchantments = extra
      if (!Array.isArray(next.itemEnchantments)) {
        next.itemEnchantments = extra
      }

      return next as Item
    })
  } catch (error) {
    console.warn('Verzauberungen konnten nicht ergänzt werden.', error)
    return items
  }
}

const STORAGE_BUCKET_ITEM_MEDIA = 'item-media'
const STORAGE_UPLOAD_ROOT = 'items'

const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'] as const

const IMAGE_MIME_EXTENSION_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

const getFileExtension = (name: string | undefined | null) => {
  if (typeof name !== 'string') {
    return ''
  }

  const trimmed = name.trim()
  if (!trimmed) {
    return ''
  }

  const dotIndex = trimmed.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return ''
  }

  return trimmed.slice(dotIndex).toLowerCase()
}

const hasAllowedImageExtension = (extension: string) =>
  ALLOWED_IMAGE_EXTENSIONS.includes(extension as (typeof ALLOWED_IMAGE_EXTENSIONS)[number])

const inferImageExtension = (file: File | null | undefined) => {
  if (!file) {
    return ''
  }

  const byName = getFileExtension(file.name)
  if (hasAllowedImageExtension(byName)) {
    return byName
  }

  const type = typeof file.type === 'string' ? file.type.trim().toLowerCase() : ''
  for (const [extension, mime] of Object.entries(IMAGE_MIME_EXTENSION_MAP)) {
    if (type && mime === type) {
      return extension
    }
  }

  return ''
}

const inferMimeTypeFromExtension = (extension: string) =>
  IMAGE_MIME_EXTENSION_MAP[extension] ?? 'application/octet-stream'

const sanitizeStorageSegment = (value: string | undefined | null, fallback: string) => {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.toLowerCase().replace(/[^a-z0-9-_]/g, '')
  return normalized || fallback
}

const createUniqueId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const buildStoragePath = (userId: string | null, variant: string, extension: string) => {
  const safeUserId = sanitizeStorageSegment(userId, 'anonymous')
  const safeVariant = sanitizeStorageSegment(variant, 'asset')
  const uniqueId = createUniqueId()
  const variantPrefix = safeVariant ? `${safeVariant}-` : ''
  return `${STORAGE_UPLOAD_ROOT}/${safeUserId}/${variantPrefix}${uniqueId}${extension}`
}

const uploadImageFile = async (
  client: SupabaseClient,
  file: File,
  variant: string,
  userId: string
) => {
  const extension = inferImageExtension(file)
  if (!extension) {
    throw new Error('Ungültiges Dateiformat.')
  }

  const path = buildStoragePath(userId, variant, extension)
  const contentType =
    typeof file.type === 'string' && file.type.trim() ? file.type : inferMimeTypeFromExtension(extension)

  const { error: uploadError } = await client.storage
    .from(STORAGE_BUCKET_ITEM_MEDIA)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType })

  if (uploadError) {
    throw uploadError
  }

  const publicUrlResult = client.storage.from(STORAGE_BUCKET_ITEM_MEDIA).getPublicUrl(path)
  const publicUrl = publicUrlResult?.data?.publicUrl ?? null

  return { path, publicUrl }
}

const parseEnchantmentsResponse = (input: unknown): Enchantment[] => {
  if (!Array.isArray(input)) {
    return []
  }

  return input
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const record = entry as Record<string, unknown>
      const id = Number(record.id)
      if (!Number.isFinite(id)) {
        return null
      }

      const rawLabel = record.label
      const label =
        typeof rawLabel === 'string' && rawLabel.trim().length > 0
          ? rawLabel.trim()
          : `Verzauberung ${id}`

      const rawSlug = record.slug
      const slug = typeof rawSlug === 'string' && rawSlug.trim().length > 0 ? rawSlug.trim() : null

      const rawDescription = record.description
      const descriptionText =
        typeof rawDescription === 'string' ? rawDescription.trim() : ''
      const description = descriptionText.length > 0 ? descriptionText : null

      const rawMaxLevelValue = Number(record['max_level'])
      const maxLevel =
        Number.isInteger(rawMaxLevelValue) && rawMaxLevelValue > 0 ? rawMaxLevelValue : 1

      return { id, label, slug, description, maxLevel }
    })
    .filter((value): value is Enchantment => value !== null)
    .sort((a, b) => a.label.localeCompare(b.label, 'de', { sensitivity: 'base' }))
}

const fallbackTypeOptions: FilterOption[] = [
  { value: '', label: 'Alle Typen' },
  { value: 'helm', label: 'Helm' },
  { value: 'brustplatte', label: 'Brustplatte' },
  { value: 'hose', label: 'Hose' },
  { value: 'stiefel', label: 'Stiefel' },
  { value: 'schildkroetenpanzer', label: 'Schildkrötenpanzer' },
  { value: 'schwert', label: 'Schwert' },
  { value: 'spitzhacke', label: 'Spitzhacke' },
  { value: 'schaufel', label: 'Schaufel' },
  { value: 'axt', label: 'Axt' },
  { value: 'hacke', label: 'Hacke' },
  { value: 'streitkolben', label: 'Streitkolben' },
  { value: 'bogen', label: 'Bogen' },
  { value: 'armbrust', label: 'Armbrust' },
  { value: 'dreizack', label: 'Dreizack' },
  { value: 'schild', label: 'Schild' },
  { value: 'totem_der_unsterblichkeit', label: 'Totem der Unsterblichkeit' },
  { value: 'angel', label: 'Angel' },
  { value: 'elytra', label: 'Elytra' },
  { value: 'sonstiges', label: 'Sonstiges' }
]

const fallbackMaterialOptions: FilterOption[] = [
  { value: '', label: 'Alle Materialien' },
  { value: 'netherite', label: 'Netherit' },
  { value: 'diamond', label: 'Diamant' },
  { value: 'gold', label: 'Gold' },
  { value: 'iron', label: 'Eisen' },
  { value: 'leather', label: 'Leder' },
  { value: 'wood', label: 'Holz' },
  { value: 'stone', label: 'Stein' },
  { value: 'other', label: 'Sonstiges' }
]

const fallbackRarityOptions: FilterOption[] = [
  { value: '', label: 'Alle Seltenheiten' },
  { value: 'selten', label: 'Selten' },
  { value: 'episch', label: 'Episch' },
  { value: 'unbezahlbar', label: 'Unbezahlbar' },
  { value: 'legendär', label: 'Legendär' },
  { value: 'jackpot', label: 'Jackpot' },
  { value: 'mega_jackpot', label: 'Mega Jackpot' }
]
const createFilterLabelMap = (options: FilterOption[]) =>

  options.reduce<Record<string, string>>((acc, option) => {
    const register = (candidate: unknown) => {
      if (typeof candidate === 'number' && Number.isFinite(candidate)) {
        acc[String(candidate)] = option.label
      } else if (typeof candidate === 'string') {
        const trimmed = candidate.trim()
        if (trimmed) {
          acc[trimmed] = option.label
        }
      }
    }

    register(option.value)
    register(option.supabaseValue)
    register(option.supabaseTextValue)


    return acc
  }, {})


const normalizeStringValue = (input: unknown) =>
  typeof input === 'string' ? input.trim() : ''

const createReferenceOptionsFromRecords = (
  entries: unknown[],
  fallbackLabelPrefix: string,
  options: { sortByLabel?: boolean } = {}
) => {
  const { sortByLabel = true } = options

  if (!Array.isArray(entries)) {
    return []
  }

  const parsedEntries = entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const record = entry as Record<string, unknown>
      const id = Number(record.id)
      if (!Number.isInteger(id) || id <= 0) {
        return null
      }

      const labelCandidate = normalizeStringValue(record.label)
      const label = labelCandidate || `${fallbackLabelPrefix} #${id}`

      const rawValueCandidates = [
        normalizeStringValue(record.slug),
        normalizeStringValue(record.value),
        normalizeStringValue(record.code)
      ]

      const resolvedValue = rawValueCandidates.find((candidate) => candidate) ?? String(id)

      const option: FilterOption = {
        value: resolvedValue,
        label,
        supabaseValue: String(id)
      }

      if (resolvedValue && resolvedValue !== option.supabaseValue) {
        option.supabaseTextValue = resolvedValue
      }

      return option
    })
    .filter((option): option is FilterOption => option !== null)

  if (!sortByLabel) {
    return parsedEntries
  }

  return parsedEntries.sort((a, b) =>
    a.label.localeCompare(b.label, 'de', { sensitivity: 'base' })
  )
}

const createRarityOptionsFromRecords = (
  entries: unknown[],
  options: { sortByLabel?: boolean } = {}
) => {
  const { sortByLabel = true } = options

  if (!Array.isArray(entries)) {
    return []
  }

  const parsedEntries = entries
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const record = entry as Record<string, unknown>
      const id = Number(record.id)
      if (!Number.isInteger(id) || id <= 0) {
        return null
      }

      const labelCandidate = normalizeStringValue(record.label)
      const label = labelCandidate || `Seltenheit #${id}`

      const code = normalizeStringValue(record.code)
      const slug = normalizeStringValue(record.slug)
      const valueCandidate = slug || code || normalizeStringValue(record.value)
      const resolvedValue = valueCandidate || String(id)

      const option: FilterOption = {
        value: resolvedValue,
        label,
        supabaseValue: String(id)
      }

      if (code) {
        option.supabaseTextValue = code
      } else if (resolvedValue && resolvedValue !== option.supabaseValue) {
        option.supabaseTextValue = resolvedValue
      }

      return option
    })
    .filter((option): option is FilterOption => option !== null)

  if (!sortByLabel) {
    return parsedEntries
  }

  return parsedEntries.sort((a, b) =>
    a.label.localeCompare(b.label, 'de', { sensitivity: 'base' })
  )
}

const rarityBadgeClasses: Record<string, string> = {
  common: 'border border-slate-700/60 bg-slate-900/40 text-slate-300',
  selten: 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  rare: 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  episch: 'border border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
  epic: 'border border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
  unbezahlbar: 'border border-amber-500/40 bg-amber-500/10 text-amber-200',
  priceless: 'border border-amber-500/40 bg-amber-500/10 text-amber-200',
  legendär: 'border border-purple-500/40 bg-purple-500/10 text-purple-300',
  legendary: 'border border-purple-500/40 bg-purple-500/10 text-purple-300',
  jackpot: 'border border-pink-500/40 bg-pink-500/10 text-pink-200',
  mega_jackpot: 'border border-rose-500/40 bg-rose-500/10 text-rose-200',
  'mega-jackpot': 'border border-rose-500/40 bg-rose-500/10 text-rose-200'
}

const MAX_RECENT_SEARCHES = 5

type ToastMessage = {
  id: number
  type: 'success' | 'error'
  message: string
}

type ItemFormValues = {
  title: string
  itemType: string
  material: string
  rarity: string
  price: string
  starLevel: string
  itemImageUrl: string
  itemLoreImageUrl: string
}

type ItemFormFileValues = {
  itemImage: File | null
  itemLoreImage: File | null
}

const initialItemFormValues: ItemFormValues = {
  title: '',
  itemType: '',
  material: '',
  rarity: '',
  price: '',
  starLevel: '0',
  itemImageUrl: '',
  itemLoreImageUrl: ''
}

const initialItemFormFileValues: ItemFormFileValues = {
  itemImage: null,
  itemLoreImage: null
}

const createInitialItemFormValues = (): ItemFormValues => ({
  ...initialItemFormValues
})

const createInitialItemFormFileValues = (): ItemFormFileValues => ({
  ...initialItemFormFileValues
})

type ItemFormErrors = Partial<Record<keyof ItemFormValues, string>>

const mapWorkerIssuesToFormState = (issues: unknown) => {
  const fieldErrors: ItemFormErrors = {}
  let enchantmentError: string | null = null
  let message: string | null = null

  if (!Array.isArray(issues)) {
    return { fieldErrors, enchantmentError, message }
  }

  for (const issue of issues) {
    if (!issue || typeof issue !== 'object') {
      continue
    }

    const record = issue as Record<string, unknown>
    const path = Array.isArray(record.path) ? record.path : []
    const field = typeof path[0] === 'string' ? path[0] : null
    const issueMessage = typeof record.message === 'string' ? record.message.trim() : ''

    if (!issueMessage) {
      continue
    }

    if (!message) {
      message = issueMessage
    }

    switch (field) {
      case 'name':
      case 'title':
        fieldErrors.title = issueMessage
        break
      case 'item_type_id':
      case 'itemType':
        fieldErrors.itemType = issueMessage
        break
      case 'material_id':
      case 'material':
        fieldErrors.material = issueMessage
        break
      case 'rarity_id':
      case 'rarity':
        fieldErrors.rarity = issueMessage
        break
      case 'star_level':
      case 'stars':
      case 'starLevel':
        fieldErrors.starLevel = issueMessage
        break
      case 'price':
        fieldErrors.price = issueMessage
        break
      case 'enchantments':
        enchantmentError = issueMessage
        break
      default:
        break
    }
  }

  return { fieldErrors, enchantmentError, message }
}

type FetchItemsParams = {
  search: string
  type: string
  material: string
  rarity: string
}

const sanitizeSearchValue = (value: string) =>
  value
    .trim()
    .replace(/[*,%]/g, ' ')
    .replace(/[()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

type SupabaseFilterResolution = {
  id: string | null
  text: string | null
}

const extractSupabaseNumericCandidate = (value: unknown): string | null => {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return String(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }

    const parsed = Number.parseInt(trimmed, 10)
    if (Number.isInteger(parsed) && parsed > 0) {
      return String(parsed)
    }
  }

  return null
}

const resolveSupabaseFilterValue = (
  value: string,
  options: FilterOption[]
): SupabaseFilterResolution => {
  const trimmed = value.trim()
  if (!trimmed) {
    return { id: null, text: null }
  }

  const selectedOption = options.find((option) => option.value === trimmed)

  const numericFromOption = extractSupabaseNumericCandidate(selectedOption?.supabaseValue)
  const numericValue = numericFromOption ?? extractSupabaseNumericCandidate(trimmed)

  const textFromOption = (() => {
    const candidate = selectedOption?.supabaseTextValue
    if (typeof candidate === 'string') {
      const normalized = candidate.trim()
      if (normalized) {
        return normalized
      }
    }
    return null
  })()

  let textValue: string | null = null
  if (textFromOption) {
    textValue = textFromOption
  } else if (!numericValue) {
    textValue = trimmed
  }

  return { id: numericValue, text: textValue }
}

const resolveNumericOptionValue = (value: string, options: FilterOption[]) => {
  const { id } = resolveSupabaseFilterValue(value, options)
  if (id) {
    const parsedSupabaseValue = Number.parseInt(id, 10)
    if (Number.isInteger(parsedSupabaseValue) && parsedSupabaseValue > 0) {
      return parsedSupabaseValue
    }
  }

  const parsedValue = Number.parseInt(value, 10)
  if (Number.isInteger(parsedValue) && parsedValue > 0) {
    return parsedValue
  }

  return null
}

function getRarityMeta(
  values: Array<string | null | undefined>,
  rarityId: number | null | undefined,
  options: FilterOption[],
  rarityLabelMap: Record<string, string>
) {
  const fallback = {
    label: 'Unbekannt',
    badgeClass: 'border border-slate-800 bg-slate-900/60 text-slate-300'
  }

  const resolveBadgeClass = (option: FilterOption | null | undefined, candidate?: string) => {
    if (option) {
      if (option.value && rarityBadgeClasses[option.value]) {
        return rarityBadgeClasses[option.value]
      }
      if (option.supabaseTextValue && rarityBadgeClasses[option.supabaseTextValue]) {
        return rarityBadgeClasses[option.supabaseTextValue]
      }
    }

    if (candidate && rarityBadgeClasses[candidate]) {
      return rarityBadgeClasses[candidate]
    }

    return fallback.badgeClass
  }

  const normalizedValues = values
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0)

  const findOption = (candidate: string) => {
    const lowerCandidate = candidate.toLowerCase()
    return options.find((option) => {
      if (option.value.trim().toLowerCase() === lowerCandidate) {
        return true
      }
      if (option.supabaseValue && option.supabaseValue.trim() === candidate) {
        return true
      }
      if (
        option.supabaseTextValue &&
        option.supabaseTextValue.trim().toLowerCase() === lowerCandidate
      ) {
        return true
      }
      return option.label.trim().toLowerCase() === lowerCandidate
    })
  }

  for (const candidate of normalizedValues) {
    const option = findOption(candidate)
    if (option) {
      return {
        label: option.label,
        badgeClass: resolveBadgeClass(option)
      }
    }

    const mappedLabel = rarityLabelMap[candidate]
    if (mappedLabel) {
      return {
        label: mappedLabel,
        badgeClass: resolveBadgeClass(null, candidate)
      }
    }
  }

  if (typeof rarityId === 'number' && Number.isFinite(rarityId)) {
    const rarityKey = String(rarityId)
    const option = options.find(
      (entry) => entry.supabaseValue === rarityKey || entry.value === rarityKey
    )

    if (option) {
      return {
        label: option.label,
        badgeClass: resolveBadgeClass(option)
      }
    }

    const mappedLabel = rarityLabelMap[rarityKey]
    if (mappedLabel) {
      return { label: mappedLabel, badgeClass: fallback.badgeClass }
    }

    return {
      label: `Seltenheit #${rarityKey}`,
      badgeClass: fallback.badgeClass
    }
  }

  return fallback
}

export default function App() {
  const [typeOptions, setTypeOptions] = useState<FilterOption[]>(fallbackTypeOptions)
  const [materialOptions, setMaterialOptions] = useState<FilterOption[]>(fallbackMaterialOptions)
  const [rarityOptions, setRarityOptions] = useState<FilterOption[]>(fallbackRarityOptions)
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [rarityFilter, setRarityFilter] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showItemModal, setShowItemModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 768px)').matches
  )
  const [toasts, setToasts] = useState<ToastMessage[]>([])
  const [imagePreview, setImagePreview] = useState<ImagePreviewDetails | null>(null)

  const typeLabelMap = useMemo(() => createFilterLabelMap(typeOptions), [typeOptions])
  const materialLabelMap = useMemo(
    () => createFilterLabelMap(materialOptions),
    [materialOptions]
  )
  const rarityLabelMap = useMemo(() => createFilterLabelMap(rarityOptions), [rarityOptions])
  const abortControllerRef = useRef<AbortController | null>(null)
  const metadataAbortControllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const { url, anonKey } = getSupabaseConfig()
    if (!url || !anonKey) {
      return
    }

    const controller = new AbortController()
    let isCancelled = false

    const loadReferenceData = async () => {
      try {
        const itemTypesPromise = supabase
          .from('item_types')
          .select('id,label,slug')
          .order('label', { ascending: true, nullsFirst: false })
          .abortSignal(controller.signal)

        const materialsPromise = supabase
          .from('materials')
          .select('id,label,slug')
          .order('id', { ascending: true, nullsFirst: false })
          .abortSignal(controller.signal)

        const raritiesPromise = supabase
          .from('rarities')
          .select('id,label,slug,sort')
          .order('sort', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true, nullsFirst: false })
          .abortSignal(controller.signal)

        const [itemTypesResult, materialsResult, raritiesResult] = await Promise.all([
          itemTypesPromise,
          materialsPromise,
          raritiesPromise,
        ])

        if (controller.signal.aborted || isCancelled) {
          return
        }

        const { data: itemTypesData, error: itemTypesError } = itemTypesResult
        const { data: materialsData, error: materialsError } = materialsResult
        const { data: raritiesData, error: raritiesError } = raritiesResult

        if (itemTypesError || materialsError || raritiesError) {
          throw itemTypesError ?? materialsError ?? raritiesError ?? new Error('Unbekannter Fehler')
        }

        const nextTypeOptions = createReferenceOptionsFromRecords(itemTypesData ?? [], 'Typ')
        if (nextTypeOptions.length > 0) {
          setTypeOptions([{ value: '', label: 'Alle Item-Typen' }, ...nextTypeOptions])
        }

        const nextMaterialOptions = createReferenceOptionsFromRecords(
          materialsData ?? [],
          'Material',
          { sortByLabel: false }
        )
        if (nextMaterialOptions.length > 0) {
          setMaterialOptions([{ value: '', label: 'Alle Materialien' }, ...nextMaterialOptions])
        }

        const nextRarityOptions = createRarityOptionsFromRecords(raritiesData ?? [], {
          sortByLabel: false,
        })
        if (nextRarityOptions.length > 0) {
          setRarityOptions([{ value: '', label: 'Alle Seltenheiten' }, ...nextRarityOptions])
        }
      } catch (error) {
        if (controller.signal.aborted || isCancelled) {
          return
        }

        console.warn('Referenzdaten konnten nicht geladen werden.', error)
      }
    }

    void loadReferenceData()

    return () => {
      isCancelled = true
      controller.abort()
    }
  }, [])

  const buildFetchParams = useCallback(
    (overrides: Partial<FetchItemsParams> = {}): FetchItemsParams => ({
      search,
      type: typeFilter,
      material: materialFilter,
      rarity: rarityFilter,
      ...overrides
    }),
    [search, typeFilter, materialFilter, rarityFilter]
  )

  const hasActiveCriteria = useCallback((params: FetchItemsParams) => {
    const sanitizedSearch = sanitizeSearchValue(params.search)
    return (
      sanitizedSearch.length > 0 ||
      params.type !== '' ||
      params.material !== '' ||
      params.rarity !== ''
    )
  }, [])

  const resetSearchState = useCallback(() => {
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setItems([])
    setError(null)
    setLoading(false)
    setHasSearched(false)
  }, [])

  const handleImagePreview = useCallback((details: ImagePreviewDetails) => {
    setImagePreview(details)
  }, [])

  const handleImagePreviewClose = useCallback(() => {
    setImagePreview(null)
  }, [])

  useEffect(() => {
    if (!imagePreview) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setImagePreview(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    let body: HTMLBodyElement | null = null
    let previousOverflow: string | null = null
    if (typeof document !== 'undefined') {
      body = document.body
      previousOverflow = body.style.overflow
      body.style.overflow = 'hidden'
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      if (body) {
        body.style.overflow = previousOverflow ?? ''
      }
    }
  }, [imagePreview])

  useEffect(() => {
    if (!showItemModal) {
      return
    }

    if (referenceLoading || referenceLoaded || referenceError) {
      return
    }

    const supabase = getSupabaseClient()
    if (!supabase) {
      setReferenceError('Supabase-Konfiguration fehlt.')
      setReferenceLoaded(false)
      return
    }

    const controller = new AbortController()
    metadataAbortControllerRef.current = controller

    const loadMetadata = async () => {
      setReferenceLoading(true)

      try {
        const itemTypesPromise = supabase
          .from('item_types')
          .select('id,label,slug')
          .order('label', { ascending: true, nullsFirst: false })
          .abortSignal(controller.signal)

        const materialsPromise = supabase
          .from('materials')
          .select('id,label,slug')
          .order('id', { ascending: true, nullsFirst: false })
          .abortSignal(controller.signal)

        const raritiesPromise = supabase
          .from('rarities')
          .select('id,label,slug,sort')
          .order('sort', { ascending: true, nullsFirst: false })
          .order('id', { ascending: true, nullsFirst: false })
          .abortSignal(controller.signal)

        const [itemTypesResult, materialsResult, raritiesResult] = await Promise.all([
          itemTypesPromise,
          materialsPromise,
          raritiesPromise,
        ])

        if (controller.signal.aborted) {
          return
        }

        const { data: itemTypesData, error: itemTypesError } = itemTypesResult
        const { data: materialsData, error: materialsError } = materialsResult
        const { data: raritiesData, error: raritiesError } = raritiesResult

        if (itemTypesError || materialsError || raritiesError) {
          throw itemTypesError ?? materialsError ?? raritiesError ?? new Error('Stammdaten konnten nicht geladen werden.')
        }

        setItemTypeOptionsState(
          parseReferenceOptions(itemTypesData ?? [], (id) => `Item-Typ #${id}`)
        )
        setMaterialOptionsState(
          parseReferenceOptions(materialsData ?? [], (id) => `Material #${id}`)
        )
        setRarityOptionsState(parseRarityOptions(raritiesData ?? []))
        setReferenceLoaded(true)
        setReferenceError(null)
      } catch (error) {
        if (controller.signal.aborted) {
          return
        }

        const message =
          error instanceof Error ? error.message : 'Stammdaten konnten nicht geladen werden.'
        setReferenceError(message)
        setReferenceLoaded(false)
      } finally {
        if (!controller.signal.aborted) {
          setReferenceLoading(false)
          metadataAbortControllerRef.current = null
        }
      }
    }

    void loadMetadata()

    return () => {
      controller.abort()
      metadataAbortControllerRef.current = null
      setReferenceLoading(false)
    }
  }, [showItemModal, referenceLoading, referenceLoaded, referenceError])

  const handleMetadataReload = useCallback(() => {
    if (referenceLoading) {
      return
    }

    setReferenceError(null)
    setReferenceLoaded(false)
  }, [referenceLoading])

  const itemTypeLabelMap = useMemo(
    () => createOptionLabelMap(itemTypeOptionsState),
    [itemTypeOptionsState]
  )
  const materialLabelMap = useMemo(
    () => createOptionLabelMap(materialOptionsState),
    [materialOptionsState]
  )
  const rarityLabelMap = useMemo(
    () => createOptionLabelMap(rarityOptionsState),
    [rarityOptionsState]
  )

  const itemTypeLookupMap = useMemo(
    () => createOptionLookupMap(itemTypeOptionsState),
    [itemTypeOptionsState]
  )
  const materialLookupMap = useMemo(
    () => createOptionLookupMap(materialOptionsState),
    [materialOptionsState]
  )
  const rarityLookupMap = useMemo(
    () => createOptionLookupMap(rarityOptionsState),
    [rarityOptionsState]
  )

  const rarityOptionByCode = useMemo(() => {
    const map: Record<string, LoadedRarityOption> = {}
    rarityOptionsState.forEach((option) => {
      map[option.value] = option
    })
    return map
  }, [rarityOptionsState])

  const rarityOptionById = useMemo(() => {
    const map: Record<string, LoadedRarityOption> = {}
    rarityOptionsState.forEach((option) => {
      map[String(option.id)] = option
      if (option.supabaseValue) {
        map[option.supabaseValue] = option
      }
    })
    return map
  }, [rarityOptionsState])

  const resolveRarityMeta = useCallback(
    (value?: string | null, rarityId?: number | null) => {
      const fallback = {
        label: 'Unbekannt',
        badgeClass: 'border border-slate-800 bg-slate-900/60 text-slate-300'
      }

      const optionFromLookup = resolveOptionFromCandidates(
        rarityLookupMap,
        rarityId,
        value
      )

      const normalizedOption = (() => {
        if (optionFromLookup) {
          return optionFromLookup
        }

        if (typeof rarityId === 'number' && Number.isFinite(rarityId)) {
          const key = String(rarityId)
          if (rarityOptionById[key]) {
            return rarityOptionById[key]
          }
        }

        if (typeof value === 'string' && value.trim()) {
          const trimmed = value.trim()
          if (rarityOptionByCode[trimmed]) {
            return rarityOptionByCode[trimmed]
          }

          const canonical = canonicalizeValue(trimmed)
          if (canonical && rarityOptionByCode[canonical]) {
            return rarityOptionByCode[canonical]
          }
        }

        return null
      })()

      if (normalizedOption) {
        const badgeKeys = [
          normalizedOption.code,
          normalizedOption.value,
          canonicalizeValue(normalizedOption.label),
        ]

        const badgeClass = badgeKeys.reduce<string | null>((acc, key) => {
          if (acc) {
            return acc
          }
          if (!key) {
            return null
          }
          return rarityBadgeClasses[key] ?? null
        }, null)

        return {
          label: normalizedOption.label,
          badgeClass: badgeClass ?? fallback.badgeClass,
        }
      }

      if (typeof rarityId === 'number' && Number.isFinite(rarityId)) {
        const key = String(rarityId)
        if (rarityLabelMap[key]) {
          return { label: rarityLabelMap[key], badgeClass: fallback.badgeClass }
        }
        return {
          label: `Seltenheit #${key}`,
          badgeClass: fallback.badgeClass,
        }
      }

      if (typeof value === 'string') {
        const trimmed = value.trim()
        if (trimmed) {
          const canonical = canonicalizeValue(trimmed)
          const label =
            rarityLabelMap[trimmed] ??
            (canonical ? rarityLabelMap[canonical] : undefined) ??
            trimmed
          const badgeClass =
            (canonical && rarityBadgeClasses[canonical]) ??
            rarityBadgeClasses[trimmed.toLowerCase()] ??
            fallback.badgeClass
          return { label, badgeClass }
        }
      }

      return fallback
    },
    [rarityLookupMap, rarityOptionById, rarityOptionByCode, rarityLabelMap]
  )

  const filterTypeOptions = useMemo<FilterOption[]>(() => {
    return typeOptions.map((option) =>
      option.value === '' ? { ...option, label: 'Alle Item-Typen' } : option
    )
  }, [typeOptions])

  const filterMaterialOptions = useMemo<FilterOption[]>(() => {
    return materialOptions
  }, [materialOptions])

  const filterRarityOptions = useMemo<FilterOption[]>(() => {
    return rarityOptions
  }, [rarityOptions])

  const fetchItems = useCallback(
    async ({ search, type, material, rarity }: FetchItemsParams) => {
      const sanitizedSearch = sanitizeSearchValue(search)
      const params = new URLSearchParams()

      if (sanitizedSearch.length > 0) {
        params.set('search', sanitizedSearch)
      }

      const typeResolution = resolveSupabaseFilterValue(type, typeOptions)
      if (typeResolution.id) {
        params.set('item_type_id', typeResolution.id)
      }

      const materialResolution = resolveSupabaseFilterValue(material, materialOptions)
      if (materialResolution.id) {
        params.set('material_id', materialResolution.id)
      }

      const rarityResolution = resolveSupabaseFilterValue(rarity, rarityOptions)
      if (rarityResolution.id) {
        params.set('rarity_id', rarityResolution.id)
      } else if (rarityResolution.text) {
        params.set('rarity', rarityResolution.text)
      }

      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      setLoading(true)
      setError(null)

      const queryString = params.toString()

      try {
        const sessionToken = getSupabaseAccessToken()
        const requestInit: RequestInit = {
          signal: controller.signal,
          credentials: 'include',
        }

        if (sessionToken) {
          requestInit.headers = {
            Authorization: `Bearer ${sessionToken}`,
          }
        }

        const response = await fetch(`/api/items${queryString ? `?${queryString}` : ''}`, requestInit)

        if (!response.ok) {
          throw new Error('API Fehler')
        }

        const data = await response.json()

        if (!Array.isArray(data)) {
          throw new Error('Unerwartetes API-Format')
        }

        if (abortControllerRef.current === controller) {
          let itemsWithEnchantments = data as Item[]

          try {
            itemsWithEnchantments = await ensureItemEnchantments(itemsWithEnchantments)
          } catch (enchantmentError) {
            console.warn('Verzauberungsdaten konnten nicht angereichert werden.', enchantmentError)
          }

          if (abortControllerRef.current === controller) {
            setItems(itemsWithEnchantments)
            setError(null)
          }
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }

        if (abortControllerRef.current === controller) {
          const message = error instanceof Error ? error.message : 'Fehler beim Laden'
          setError(message)
          setItems([])
        }
      } finally {
        if (abortControllerRef.current === controller) {
          setLoading(false)
          abortControllerRef.current = null
        }
      }
    },
    [typeOptions, materialOptions, rarityOptions]
  )

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  const showToast = useCallback(
    (type: ToastMessage['type'], message: string) => {
      const id = Date.now() + Math.random()
      setToasts((prev) => [...prev, { id, type, message }])
      window.setTimeout(() => {
        dismissToast(id)
      }, 4000)
    },
    [dismissToast]
  )

  const handleModalSuccess = useCallback(
    (message: string) => {
      showToast('success', message)
    },
    [showToast]
  )

  const handleModalError = useCallback(
    (message: string) => {
      showToast('error', message)
    },
    [showToast]
  )

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    const body = document.body
    if (showItemModal || showProfileModal) {
      body.classList.add('overflow-hidden')
    } else {
      body.classList.remove('overflow-hidden')
    }
    return () => {
      body.classList.remove('overflow-hidden')
    }
  }, [showItemModal, showProfileModal])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const mediaQuery = window.matchMedia('(min-width: 768px)')

    const handleChange = (event: MediaQueryListEvent) => {
      setIsDesktop(event.matches)
      if (event.matches) {
        setIsMobileMenuOpen(false)
      }
    }

    setIsDesktop(mediaQuery.matches)
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
    } else {
      mediaQuery.addListener(handleChange)
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleChange)
      } else {
        mediaQuery.removeListener(handleChange)
      }
    }
  }, [])

  useEffect(() => {
    if (!isMobileMenuOpen) return
    if (typeof window === 'undefined') return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsMobileMenuOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isMobileMenuOpen])

  useEffect(() => {
    if (showItemModal || showProfileModal) {
      setIsMobileMenuOpen(false)
    }
  }, [showItemModal, showProfileModal])

  const filteredItems = useMemo(() => {
    const normalizedSearch = sanitizeSearchValue(search).toLowerCase()
    const typeResolution = resolveSupabaseFilterValue(typeFilter, typeOptions)
    const materialResolution = resolveSupabaseFilterValue(materialFilter, materialOptions)
    const rarityResolution = resolveSupabaseFilterValue(rarityFilter, rarityOptions)

    const matchesResolution = (
      resolution: SupabaseFilterResolution,
      numericCandidates: Array<number | string | null | undefined>,
      stringCandidates: Array<string | null | undefined>,
      labelMap: Record<string, string>
    ) => {
      if (resolution.id) {
        for (const candidate of numericCandidates) {
          const numericCandidate = extractSupabaseNumericCandidate(candidate)
          if (numericCandidate && numericCandidate === resolution.id) {
            return true
          }
        }
        return false
      }

      if (resolution.text) {
        const normalizedFilter = resolution.text.trim().toLowerCase()
        if (!normalizedFilter) {
          return true
        }

        const candidates: string[] = []

        for (const candidate of stringCandidates) {
          if (typeof candidate === 'string') {
            const normalized = candidate.trim()
            if (normalized) {
              candidates.push(normalized.toLowerCase())
            }
          }
        }

        for (const candidate of numericCandidates) {
          const numericCandidate = extractSupabaseNumericCandidate(candidate)
          if (numericCandidate) {
            const mapped = labelMap[numericCandidate]
            if (mapped) {
              const normalizedMapped = mapped.trim().toLowerCase()
              if (normalizedMapped) {
                candidates.push(normalizedMapped)
              }
            }
          }
        }

        return candidates.some((candidate) => candidate === normalizedFilter)
      }

      return true
    }

    return items
      .filter((item) => {
        const matchesSearch =
          normalizedSearch.length === 0 ||
          [item.title, item.slug, item.description ?? ''].some((field) =>
            field?.toLowerCase().includes(normalizedSearch)
          )
        const typeNumericCandidates = [
          item.item_type_id,
          item.itemTypeId,
          item.item_types?.id
        ]
        const typeStringCandidates = [
          item.type,
          item.item_types?.label,
          item.item_types?.code,
          item.item_types?.slug
        ]
        const matchesType = matchesResolution(
          typeResolution,
          typeNumericCandidates,
          typeStringCandidates,
          typeLabelMap
        )

        const materialNumericCandidates = [
          item.material_id,
          item.materialId,
          item.materials?.id
        ]
        const materialStringCandidates = [
          item.material,
          item.materials?.label,
          item.materials?.code,
          item.materials?.slug
        ]
        const matchesMaterial = matchesResolution(
          materialResolution,
          materialNumericCandidates,
          materialStringCandidates,
          materialLabelMap
        )

        const rarityNumericCandidates = [
          item.rarity_id,
          item.rarityId,
          item.rarities?.id
        ]
        const rarityStringCandidates = [
          item.rarity,
          item.rarities?.label,
          item.rarities?.code
        ]
        const matchesRarity = matchesResolution(
          rarityResolution,
          rarityNumericCandidates,
          rarityStringCandidates,
          rarityLabelMap
        )

        return matchesSearch && matchesType && matchesMaterial && matchesRarity
      })
      .sort((a, b) => (a.title || '').localeCompare(b.title || '', 'de', { sensitivity: 'base' }))
  }, [
    items,
    search,
    typeFilter,
    materialFilter,
    rarityFilter,
    typeOptions,
    materialOptions,
    rarityOptions,
    typeLabelMap,
    materialLabelMap,
    rarityLabelMap
  ])

  const normalizedSearchTerm = sanitizeSearchValue(search)
  const activeFilterCount = [typeFilter, materialFilter, rarityFilter].filter(Boolean).length
  const hasActiveFilters = normalizedSearchTerm.length > 0 || activeFilterCount > 0
  const resultsCount = filteredItems.length

  const resultsDescription = !hasSearched
    ? 'Starte eine Suche oder wähle Filter, um Items zu laden.'
    : loading
      ? 'Ergebnisse werden geladen …'
      : error
        ? 'Beim Laden der Items ist ein Fehler aufgetreten.'
        : resultsCount === 0
          ? 'Keine Items entsprechen deinen Kriterien.'
          : hasActiveFilters
            ? `${resultsCount} ${resultsCount === 1 ? 'Item entspricht' : 'Items entsprechen'} deinen Suchkriterien.`
            : `${resultsCount === 1 ? 'Ein Item' : `${resultsCount} Items`} gefunden.`

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedSearch = search.trim()
    const params = buildFetchParams({ search: trimmedSearch })

    if (!hasActiveCriteria(params)) {
      resetSearchState()
      return
    }

    setHasSearched(true)
    void fetchItems(params)

    if (!trimmedSearch) {
      return
    }

    setRecentSearches((prev) => {
      const existing = prev.filter((entry) => entry.toLowerCase() !== trimmedSearch.toLowerCase())
      return [trimmedSearch, ...existing].slice(0, MAX_RECENT_SEARCHES)
    })
  }

  const handleRecentSearchSelect = (entry: string) => {
    setSearch(entry)
    const params = buildFetchParams({ search: entry })

    if (!hasActiveCriteria(params)) {
      resetSearchState()
      return
    }

    setHasSearched(true)
    void fetchItems(params)
  }

  const handleTypeFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value
    setTypeFilter(nextValue)

    const params = buildFetchParams({ type: nextValue })

    if (!hasActiveCriteria(params)) {
      resetSearchState()
      return
    }

    setHasSearched(true)
    void fetchItems(params)
  }

  const handleMaterialFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value
    setMaterialFilter(nextValue)

    const params = buildFetchParams({ material: nextValue })

    if (!hasActiveCriteria(params)) {
      resetSearchState()
      return
    }

    setHasSearched(true)
    void fetchItems(params)
  }

  const handleRarityFilterChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextValue = event.target.value
    setRarityFilter(nextValue)

    const params = buildFetchParams({ rarity: nextValue })

    if (!hasActiveCriteria(params)) {
      resetSearchState()
      return
    }

    setHasSearched(true)
    void fetchItems(params)
  }

  const mobileMenuClassName = [
    'flex-col gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-3 text-sm text-slate-200 shadow-lg shadow-emerald-500/10 md:flex md:flex-row md:items-center md:gap-6 md:border-transparent md:bg-transparent md:p-0 md:shadow-none',
    isMobileMenuOpen ? 'flex' : 'hidden'
  ].join(' ')

  const mobileMenuHidden = !isDesktop && !isMobileMenuOpen
  const mobileMenuAriaHidden = isDesktop ? undefined : mobileMenuHidden

  return (
    <div className="min-h-full flex flex-col">
      <div
        className="pointer-events-none fixed top-4 left-1/2 z-[60] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-3 px-4 sm:px-0"
        aria-live="assertive"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 text-sm shadow-lg transition ${
              toast.type === 'error'
                ? 'border-red-500/50 bg-red-500/10 text-red-100 shadow-red-500/10'
                : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100 shadow-emerald-500/10'
            }`}
          >
            {toast.type === 'error' ? (
              <AlertIcon className="h-5 w-5 flex-shrink-0" />
            ) : (
              <CheckIcon className="h-5 w-5 flex-shrink-0" />
            )}
            <div className="flex-1 leading-relaxed">{toast.message}</div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              className="rounded-full p-1 text-slate-400 transition hover:bg-slate-900/60 hover:text-slate-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
              aria-label="Benachrichtigung schließen"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      <header className="relative z-50 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-sm font-semibold uppercase tracking-wide text-emerald-300">
              <img
                src={logoUrl}
                alt="Logo der OP Item Datenbank"
                className="h-6 w-6"
              />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">V 0.9</p>
              <p className="text-lg font-semibold text-slate-100">OP ITEM DATENBANK</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((prev) => !prev)}
              className="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500/70 hover:text-emerald-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60 md:hidden"
              aria-expanded={isMobileMenuOpen}
              aria-controls="app-menu"
              aria-haspopup="true"
              aria-label="Hauptnavigation umschalten"
            >
              <span className="relative flex h-2.5 w-4 flex-col justify-between">
                <span className="block h-0.5 rounded bg-current" />
                <span className="block h-0.5 rounded bg-current" />
                <span className="block h-0.5 rounded bg-current" />
              </span>
              Menü
            </button>

            <nav
              id="app-menu"
              className={mobileMenuClassName}
              hidden={mobileMenuHidden}
              aria-hidden={mobileMenuAriaHidden}
              role="navigation"
              aria-label="Hauptnavigation"
            >
              <a
                href="#item-grid"
                className="rounded-xl px-3 py-2 transition hover:text-emerald-300 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Zur Liste
              </a>
            </nav>

            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="inline-flex items-center gap-4 rounded-full border border-slate-800/80 bg-slate-900/60 px-7 py-2.5 text-base font-semibold text-slate-200 transition hover:border-emerald-500/70 hover:text-emerald-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
            >
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500/10 text-base font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                U
              </span>
              <span className="text-base">Profil</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 pb-32 md:pb-16">
        <section className="relative mx-auto w-full max-w-6xl px-6 pt-12">
          <div className="relative rounded-3xl border border-slate-800/70 bg-gradient-to-br from-slate-900 via-slate-950 to-slate-950 p-8 shadow-2xl shadow-emerald-500/10 sm:p-10 lg:p-12">
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
              <div className="absolute -right-24 top-1/2 h-64 w-64 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-3xl" />
              <div className="absolute -left-16 -top-16 h-40 w-40 rounded-full bg-indigo-500/10 blur-3xl" />
            </div>
            <div className="relative z-10 flex flex-col gap-10">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-4">
                  <span className="inline-flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                    <img
                      src={logoUrl}
                      alt="Logo der OP Item Datenbank"
                      className="h-12 w-12"
                    />
                  </span>
                  <div className="space-y-4">
                    <div>
                      <p className="text-xs uppercase tracking-[0.45em] text-emerald-300/80">OP Item Datenbank</p>
                      <h1 className="mt-3 text-4xl font-bold text-slate-50 sm:text-5xl">Finde was du suchst…</h1>
                    </div>
                    <p className="max-w-2xl text-base text-slate-400">
                      Durchsuche die Datenbank, filtere nach Item-Typ, Material oder Seltenheit und entdecke dein neues Lieblingsitem.
                    </p>
                  </div>
                </div>
              </div>

              <form className="space-y-8" aria-label="Items durchsuchen" onSubmit={handleSearchSubmit}>
                <label className="block" htmlFor="search-input">
                  <span className="sr-only">Nach Items suchen</span>
                  <div className="relative">
                    <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-slate-500">
                      <SearchIcon className="h-5 w-5" />
                    </span>
                    <input
                      id="search-input"
                      name="search"
                      type="search"
                      placeholder="Nach Items suchen…"
                      className="w-full rounded-2xl border border-slate-800 bg-slate-950/80 py-4 pl-12 pr-4 text-base text-slate-100 placeholder:text-slate-500 shadow-inner shadow-slate-950/40 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      autoComplete="off"
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                    />
                  </div>
                </label>

                <div className="grid gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))_auto_auto] md:items-end">
                  <label className="block" htmlFor="filter-type">
                    <span className="text-sm font-medium text-slate-300">Item-Typ</span>
                    <select
                      id="filter-type"
                      name="type"
                      className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      value={typeFilter}
                      onChange={handleTypeFilterChange}
                    >
                      {filterTypeOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block" htmlFor="filter-material">
                    <span className="text-sm font-medium text-slate-300">Material</span>
                    <select
                      id="filter-material"
                      name="material"
                      className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      value={materialFilter}
                      onChange={handleMaterialFilterChange}
                    >
                      {filterMaterialOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block" htmlFor="filter-rarity">
                    <span className="text-sm font-medium text-slate-300">Seltenheit</span>
                    <select
                      id="filter-rarity"
                      name="rarity"
                      className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      value={rarityFilter}
                      onChange={handleRarityFilterChange}
                    >
                      {filterRarityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="col-span-full md:col-auto md:self-end md:justify-self-end">
                    <button
                      type="submit"
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60 md:w-auto"
                    >
                      Suchen
                    </button>
                  </div>

                  <div className="col-span-full md:col-auto md:self-end md:justify-self-end">
                    <button
                      type="button"
                      onClick={() => setShowItemModal(true)}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-emerald-500/60 bg-emerald-500/10 px-5 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60 md:w-auto md:px-6 md:py-2.5"
                    >
                      <PlusIcon className="h-4 w-4" />
                      Item hinzufügen
                    </button>
                  </div>
                </div>

                <p className="text-sm text-slate-500">Nutze die Filter, um schneller zum passenden Item zu gelangen.</p>
              </form>
            </div>
          </div>
        </section>

        <section id="item-grid" className="mx-auto w-full max-w-6xl px-6 py-12">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="space-y-6">
              <div className="flex flex-col gap-2">
                <h2 className="text-lg font-semibold text-slate-100">Recent Searches</h2>
                <p className="text-sm text-slate-500">Deine letzten Anfragen als schnelle Shortcuts.</p>
              </div>
              <div className="min-h-[160px] rounded-2xl border border-slate-800/70 bg-slate-900/50 p-6 shadow-inner shadow-slate-950/60">
                {recentSearches.length === 0 ? (
                  <p className="text-sm text-slate-500">Noch keine Suchanfragen gespeichert.</p>
                ) : (
                  <ul className="flex flex-wrap gap-2">
                    {recentSearches.map((entry) => (
                      <li key={entry}>
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-500/20 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
                          onClick={() => handleRecentSearchSelect(entry)}
                        >
                          <SearchIcon className="h-3.5 w-3.5" />
                          {entry}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <div className="space-y-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-100">Suchergebnisse</h2>
                  <p className="text-sm text-slate-500">{resultsDescription}</p>
                </div>
                <span className="text-xs uppercase tracking-[0.3em] text-slate-600">Live-Ansicht</span>
              </div>
              <div className="min-h-[320px] space-y-4">
                {!hasSearched ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
                    Starte eine Suche oder kombiniere Filter, um passende Items zu sehen.
                  </div>
                ) : loading ? (
                  <div className="flex h-48 items-center justify-center">
                    <span className="inline-flex items-center gap-2 text-sm text-slate-400">
                      <SpinnerIcon className="h-4 w-4" />
                      Items werden geladen…
                    </span>
                  </div>
                ) : error ? (
                  <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
                    {error}
                  </div>
                ) : resultsCount === 0 ? (
                  <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400">
                    Keine Items gefunden. Passe deine Suche oder Filter an, um weitere Ergebnisse zu entdecken.
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredItems.map((item) => (
                      <ItemCard
                        key={item.id}
                        item={item}
                        typeLabelMap={typeLabelMap}
                        materialLabelMap={materialLabelMap}
                        rarityLabelMap={rarityLabelMap}
                        rarityOptions={rarityOptions}
                        onImagePreview={handleImagePreview}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {showProfileModal && <ProfileModal onClose={() => setShowProfileModal(false)} />}
      {showItemModal && (
        <ItemModal
          onClose={() => setShowItemModal(false)}
          onSuccess={handleModalSuccess}
          onError={handleModalError}
          itemTypeOptions={itemTypeOptionsState}
          materialOptions={materialOptionsState}
          rarityOptions={rarityOptionsState}
          referenceLoading={referenceLoading}
          referenceError={referenceError}
          onReloadMetadata={handleMetadataReload}
        />
      )}
      {imagePreview && (
        <ImagePreviewModal
          imageUrl={imagePreview.url}
          title={imagePreview.title}
          onClose={handleImagePreviewClose}
        />
      )}
    </div>
  )
}

type ModalProps = {
  onClose: () => void
}

type ItemModalProps = ModalProps & {
  onSuccess: (message: string) => void
  onError: (message: string) => void
  itemTypeOptions: LoadedFilterOption[]
  materialOptions: LoadedFilterOption[]
  rarityOptions: LoadedRarityOption[]
  referenceLoading: boolean
  referenceError: string | null
  onReloadMetadata: () => void
}

type ImagePreviewModalProps = ModalProps & {
  imageUrl: string
  title: string
}

function ImagePreviewModal({ imageUrl, title, onClose }: ImagePreviewModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-preview-modal-title"
      aria-describedby="image-preview-modal-description"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-3xl rounded-3xl border border-slate-800/80 bg-slate-950 p-6 shadow-2xl shadow-emerald-500/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="image-preview-modal-title" className="text-xl font-semibold text-slate-50">
              Bildvorschau
            </h2>
            <p id="image-preview-modal-description" className="mt-1 text-sm text-slate-400">
              {title}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-900 hover:text-slate-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
            aria-label="Modal schließen"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-6">
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
            <img
              src={imageUrl}
              alt={`Vergrößerte Abbildung von ${title}`}
              draggable={false}
              className="max-h-[70vh] w-full object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  )
}

function ProfileModal({ onClose }: ModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-slate-800/80 bg-slate-950 p-6 shadow-2xl shadow-emerald-500/10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="profile-modal-title" className="text-xl font-semibold text-slate-50">
              Profil
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Melde dich an, um Items einzureichen und Community-Erfolge zu sammeln.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-400 transition hover:bg-slate-900 hover:text-slate-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
            aria-label="Modal schließen"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-6 space-y-6">
          <div className="flex items-center gap-4">
            <span className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-xl font-semibold text-slate-200 ring-1 ring-slate-800">
              ?
            </span>
            <div>
              <p className="text-sm text-slate-500">Anzeigename</p>
              <p className="text-lg font-semibold text-slate-100">Nicht angemeldet</p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Eingereichte Items</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-300">0</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Erhaltene Likes</p>
              <p className="mt-2 text-2xl font-semibold text-emerald-300">0</p>
            </div>
          </div>

          <div className="space-y-3 text-sm text-slate-400">
            <p>
              Verbinde deinen Minecraft-Account, um Profildaten zu speichern und deinen Namen in der Item-Liste erscheinen zu lassen.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ItemModal({
  onClose,
  onSuccess,
  onError,
  itemTypeOptions,
  materialOptions,
  rarityOptions,
  referenceLoading,
  referenceError,
  onReloadMetadata,
}: ItemModalProps) {
  const [formValues, setFormValues] = useState<ItemFormValues>(() => createInitialItemFormValues())
  const [fileValues, setFileValues] = useState<ItemFormFileValues>(() => createInitialItemFormFileValues())
  const [errors, setErrors] = useState<ItemFormErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const [enchantments, setEnchantments] = useState<Enchantment[]>([])
  const [enchantmentsLoading, setEnchantmentsLoading] = useState(false)
  const [enchantmentsError, setEnchantmentsError] = useState<string | null>(null)
  const [enchantmentsSearch, setEnchantmentsSearch] = useState('')
  const [selectedEnchantments, setSelectedEnchantments] = useState<Map<number, number>>(
    () => new Map()
  )
  const [enchantmentError, setEnchantmentError] = useState<string | null>(null)
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const enchantmentsAbortControllerRef = useRef<AbortController | null>(null)

  const metadataLoaded =
    itemTypeOptions.length > 0 && materialOptions.length > 0 && rarityOptions.length > 0
  const metadataLoadingActive = referenceLoading && !metadataLoaded
  const metadataErrorActive = Boolean(referenceError) && !metadataLoaded
  const metadataSelectDisabled = metadataLoadingActive || metadataErrorActive
  const metadataPlaceholderLabel = metadataLoadingActive
    ? 'Stammdaten werden geladen…'
    : metadataErrorActive
      ? 'Stammdaten nicht verfügbar'
      : 'Bitte auswählen'

  const starLevelValue = Math.max(
    0,
    Math.min(MAX_STAR_LEVEL, Number(formValues.starLevel) || 0)
  )
  const [starPreviewValue, setStarPreviewValue] = useState<number | null>(null)
  const starButtonRefs = useRef<(HTMLButtonElement | null)[]>([])
  const focusStarButton = useCallback((value: number) => {
    if (starButtonRefs.current.length === 0) {
      return
    }

    const normalized = value <= 1 ? 1 : Math.min(value, MAX_STAR_LEVEL)
    const targetIndex = normalized - 1
    starButtonRefs.current[targetIndex]?.focus()
  }, [])
  const activeStarLevel = starPreviewValue ?? starLevelValue

  useEffect(() => {
    titleInputRef.current?.focus()
  }, [])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  useEffect(() => {
    let isActive = true
    const controller = new AbortController()
    enchantmentsAbortControllerRef.current = controller

    const loadEnchantments = async () => {
      setEnchantmentsLoading(true)
      setEnchantmentsError(null)

      try {
        const response = await fetch('/api/enchantments', { signal: controller.signal })
        if (!response.ok) {
          throw new Error('Request failed')
        }

        const data = await response.json().catch(() => null)
        if (!isActive) {
          return
        }

        setEnchantments(parseEnchantmentsResponse(data))
      } catch (error) {
        if (controller.signal.aborted || !isActive) {
          return
        }

        setEnchantmentsError('Verzauberungen konnten nicht geladen werden.')
        setEnchantments([])
      } finally {
        if (isActive) {
          setEnchantmentsLoading(false)
        }
      }
    }

    void loadEnchantments()

    return () => {
      isActive = false
      controller.abort()
      enchantmentsAbortControllerRef.current = null
    }
  }, [])

  useEffect(() => {
    setSelectedEnchantments((prev) => {
      if (prev.size === 0) {
        return prev
      }

      const byId = new Map(enchantments.map((enchantment) => [enchantment.id, enchantment]))
      let changed = false
      const next = new Map<number, number>()

      prev.forEach((level, id) => {
        const enchantment = byId.get(id)
        if (!enchantment) {
          changed = true
          return
        }

        const normalizedLevel = Math.max(
          1,
          Math.min(enchantment.maxLevel, Math.round(level) || 1)
        )

        next.set(id, normalizedLevel)

        if (normalizedLevel !== level) {
          changed = true
        }
      })

      return changed ? next : prev
    })
  }, [enchantments])

  const handleFieldChange = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const fieldName = event.target.name as keyof ItemFormValues
    const fieldValue = event.target.value

    setFormValues((prev) => ({
      ...prev,
      [fieldName]: fieldValue
    }))

    setErrors((prev) => {
      if (!prev[fieldName]) {
        return prev
      }
      const next = { ...prev }
      delete next[fieldName]
      return next
    })
  }

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const fieldName = event.target.name as keyof ItemFormFileValues
    const file = event.target.files?.[0] ?? null

    setFileValues((prev) => ({
      ...prev,
      [fieldName]: file
    }))
  }

  const updateStarLevel = (nextValue: number) => {
    const normalized = Math.max(0, Math.min(MAX_STAR_LEVEL, Math.round(nextValue) || 0))

    setStarPreviewValue(null)
    setFormValues((prev) => ({
      ...prev,
      starLevel: String(normalized)
    }))

    setErrors((prev) => {
      if (!prev.starLevel) {
        return prev
      }
      const next = { ...prev }
      delete next.starLevel
      return next
    })
  }

  const handleEnchantmentSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setEnchantmentsSearch(event.target.value)
  }

  const handleEnchantmentToggle = (enchantment: Enchantment, checked: boolean) => {
    setSelectedEnchantments((prev) => {
      const next = new Map(prev)
      if (checked) {
        const level = next.get(enchantment.id) ?? 1
        const normalized = Math.max(
          1,
          Math.min(enchantment.maxLevel, Math.round(level) || 1)
        )
        next.set(enchantment.id, normalized)
      } else {
        next.delete(enchantment.id)
      }
      return next
    })
    setEnchantmentError(null)
  }

  const handleEnchantmentLevelChange = (enchantment: Enchantment, value: string) => {
    const level = Number(value)

    setSelectedEnchantments((prev) => {
      if (!prev.has(enchantment.id)) {
        return prev
      }

      const next = new Map(prev)
      const normalized = Math.max(
        1,
        Math.min(enchantment.maxLevel, Number.isFinite(level) ? Math.round(level) : 1)
      )
      next.set(enchantment.id, normalized)
      return next
    })
    setEnchantmentError(null)
  }

  const handleRemoveSelectedEnchantment = (id: number) => {
    setSelectedEnchantments((prev) => {
      if (!prev.has(id)) {
        return prev
      }
      const next = new Map(prev)
      next.delete(id)
      return next
    })
    setEnchantmentError(null)
  }

  const filteredEnchantments = useMemo(() => {
    const normalizedSearch = enchantmentsSearch.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!normalizedSearch) {
      return enchantments
    }

    return enchantments.filter((enchantment) => {
      const haystacks = [
        enchantment.label,
        enchantment.slug ?? '',
        enchantment.description ?? ''
      ]
      return haystacks.some((value) => value.toLowerCase().includes(normalizedSearch))
    })
  }, [enchantments, enchantmentsSearch])

  const selectedEnchantmentEntries = useMemo(() => {
    if (selectedEnchantments.size === 0) {
      return []
    }

    const byId = new Map(enchantments.map((enchantment) => [enchantment.id, enchantment]))

    return Array.from(selectedEnchantments.entries())
      .map(([id, level]) => {
        const enchantment = byId.get(id)
        if (!enchantment) {
          return null
        }

        const normalizedLevel = Math.max(
          1,
          Math.min(enchantment.maxLevel, Math.round(level) || 1)
        )

        return { enchantment, level: normalizedLevel }
      })
      .filter((entry): entry is { enchantment: Enchantment; level: number } => entry !== null)
      .sort((a, b) =>
        a.enchantment.label.localeCompare(b.enchantment.label, 'de', { sensitivity: 'base' })
      )
  }, [enchantments, selectedEnchantments])

  const collectSelectedEnchantments = useCallback(() => {
    const byId = new Map(enchantments.map((enchantment) => [enchantment.id, enchantment]))
    const selections: { id: number; level: number }[] = []
    let validationError: string | null = null

    selectedEnchantments.forEach((level, id) => {
      const enchantment = byId.get(id)
      if (!enchantment) {
        return
      }

      if (!Number.isFinite(level)) {
        validationError = 'Ungültiges Level für Verzauberungen.'
        return
      }

      const normalizedLevel = Math.max(
        1,
        Math.min(enchantment.maxLevel, Math.round(level))
      )

      selections.push({ id, level: normalizedLevel })
    })

    return { selections, error: validationError }
  }, [enchantments, selectedEnchantments])

  const getFieldClassName = (field: keyof ItemFormValues) => {
    const hasError = Boolean(errors[field])
    return [
      'mt-1 w-full rounded-lg border bg-slate-900 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2',
      hasError
        ? 'border-rose-500/60 focus:border-rose-400 focus:ring-rose-500/40'
        : 'border-slate-800 focus:border-emerald-400 focus:ring-emerald-500/40'
    ].join(' ')
  }

  const getErrorId = (field: keyof ItemFormValues) =>
    errors[field] ? `item-modal-${field}-error` : undefined

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const trimmedTitle = formValues.title.trim()
    const priceValue = formValues.price.trim()
    const itemImageUrlValue = formValues.itemImageUrl.trim()
    const itemLoreImageUrlValue = formValues.itemLoreImageUrl.trim()
    const nextErrors: ItemFormErrors = {}

    if (!trimmedTitle) {
      nextErrors.title = 'Name ist erforderlich.'
    }

    const selectedItemType = itemTypeOptions.find((option) => option.value === formValues.itemType)
    if (!selectedItemType) {
      nextErrors.itemType = itemTypeOptions.length === 0
        ? 'Item-Typen konnten nicht geladen werden. Bitte lade die Stammdaten neu.'
        : 'Bitte wähle einen gültigen Item-Typ.'
    }

    const selectedMaterial = materialOptions.find((option) => option.value === formValues.material)
    if (!selectedMaterial) {
      nextErrors.material = materialOptions.length === 0
        ? 'Materialien konnten nicht geladen werden. Bitte lade die Stammdaten neu.'
        : 'Bitte wähle ein gültiges Material.'
    }

    const selectedRarity = rarityOptions.find((option) => option.value === formValues.rarity)
    if (!selectedRarity) {
      nextErrors.rarity = rarityOptions.length === 0
        ? 'Seltenheiten konnten nicht geladen werden. Bitte lade die Stammdaten neu.'
        : 'Bitte wähle eine gültige Seltenheit.'
    }

    if (priceValue) {
      const parsedPrice = Number(priceValue.replace(',', '.'))
      if (!Number.isFinite(parsedPrice)) {
        nextErrors.price = 'Preis muss eine gültige Zahl sein.'
      } else if (parsedPrice < 0) {
        nextErrors.price = 'Preis darf nicht negativ sein.'
      }
    }

    let normalizedItemImageUrl: string | null = null
    if (itemImageUrlValue) {
      try {
        const parsed = new URL(itemImageUrlValue)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('invalid')
        }
        normalizedItemImageUrl = parsed.toString()
      } catch (error) {
        void error
        nextErrors.itemImageUrl = 'Bitte gib eine gültige Bild-URL (http/https) ein.'
      }
    }

    let normalizedItemLoreImageUrl: string | null = null
    if (itemLoreImageUrlValue) {
      try {
        const parsed = new URL(itemLoreImageUrlValue)
        if (!['http:', 'https:'].includes(parsed.protocol)) {
          throw new Error('invalid')
        }
        normalizedItemLoreImageUrl = parsed.toString()
      } catch (error) {
        void error
        nextErrors.itemLoreImageUrl = 'Bitte gib eine gültige Lore-Bild-URL (http/https) ein.'
      }
    }

    const rawStarLevel = Number(formValues.starLevel)
    const starLevelIsValid =
      Number.isInteger(rawStarLevel) && rawStarLevel >= 0 && rawStarLevel <= MAX_STAR_LEVEL
    const normalizedStarLevel = starLevelIsValid ? rawStarLevel : 0
    if (!starLevelIsValid) {
      nextErrors.starLevel = `Stern-Level muss zwischen 0 und ${MAX_STAR_LEVEL} liegen.`
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }

    if (!selectedItemType || !selectedMaterial || !selectedRarity) {
      return
    }

    const { selections, error: enchantmentsValidationError } = collectSelectedEnchantments()
    if (enchantmentsValidationError) {
      setEnchantmentError(enchantmentsValidationError)
      return
    }

    setEnchantmentError(null)
    const ensuredItemTypeId = itemTypeId!
    const ensuredMaterialId = materialId!
    const ensuredRarityId = rarityId!

    const supabase = getSupabaseClient()
    const uploadedFilePaths: string[] = []
    const cleanupUploads = async () => {
      if (!uploadedFilePaths.length || !supabase) {
        return
      }

      try {
        await supabase.storage.from(STORAGE_BUCKET_ITEM_MEDIA).remove(uploadedFilePaths)
      } catch (cleanupError) {
        console.warn('Bereits hochgeladene Dateien konnten nicht entfernt werden.', cleanupError)
      }
    }

    let uploadErrorMessage: string | null = null

    setSubmitting(true)

    try {
      const sessionToken = getSupabaseAccessToken()
      const payload: Record<string, unknown> = {
        title: trimmedTitle,
        item_type_id: selectedItemType.id,
        material_id: selectedMaterial.id,
        star_level: normalizedStarLevel,
        enchantments: selections,
      }

      if (selectedRarity.id) {
        payload.rarity_id = selectedRarity.id
      }

      const rarityCode = selectedRarity.code || canonicalizeValue(selectedRarity.value)
      if (rarityCode) {
        payload.rarity = rarityCode
      }

      if (normalizedItemImageUrl) {
        payload.item_image = normalizedItemImageUrl
        payload.image_url = normalizedItemImageUrl
      }

      if (normalizedItemLoreImageUrl) {
        payload.item_lore_image = normalizedItemLoreImageUrl
        payload.lore_image_url = normalizedItemLoreImageUrl
      }

      const requestInit: RequestInit = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(payload),
      }

      if (sessionToken) {
        requestInit.headers = {
          ...requestInit.headers,
          Authorization: `Bearer ${sessionToken}`,
        }
      }

      const response = await fetch('/api/items', requestInit)
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        if (result && typeof result === 'object' && Array.isArray(result['issues'])) {
          const issues = result['issues'] as Array<{ path?: unknown; message?: unknown }>
          const fieldMap: Record<string, keyof ItemFormValues | 'enchantments'> = {
            item_type_id: 'itemType',
            itemType: 'itemType',
            material_id: 'material',
            material: 'material',
            rarity: 'rarity',
            rarity_id: 'rarity',
            name: 'title',
            title: 'title',
            star_level: 'starLevel',
            stars: 'starLevel',
            item_image: 'itemImageUrl',
            image_url: 'itemImageUrl',
            item_lore_image: 'itemLoreImageUrl',
            lore_image_url: 'itemLoreImageUrl',
            enchantments: 'enchantments',
          }

          const serverErrors: ItemFormErrors = {}
          let enchantmentIssue: string | null = null

          issues.forEach((issue) => {
            if (!issue || typeof issue !== 'object') {
              return
            }

            const path = Array.isArray(issue.path) ? issue.path[0] : null
            const message =
              typeof issue.message === 'string' && issue.message.trim()
                ? issue.message.trim()
                : 'Ungültige Eingabe.'

            if (typeof path === 'string' && fieldMap[path]) {
              const target = fieldMap[path]
              if (target === 'enchantments') {
                enchantmentIssue = message
              } else {
                serverErrors[target] = message
              }
            }
          })

          if (Object.keys(serverErrors).length > 0) {
            setErrors((prev) => ({ ...prev, ...serverErrors }))
          }

          if (enchantmentIssue) {
            setEnchantmentError(enchantmentIssue)
          }
        }

        const errorMessage =
          (result && typeof result === 'object' && typeof result['message'] === 'string'
            ? result['message']
            : null) ?? 'Fehler beim Speichern ❌'
        throw new Error(errorMessage)

      }

      onSuccess('Item gespeichert ✅')
      setFormValues(createInitialItemFormValues())
      setFileValues(createInitialItemFormFileValues())
      setErrors({})
      setEnchantmentsSearch('')
      setSelectedEnchantments(() => new Map())
      setEnchantmentError(null)
      onClose()
    } catch (error) {
      const message =
        error instanceof Error && error.message ? error.message : 'Fehler beim Speichern ❌'
      onError(message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/80 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-3xl max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-4rem)] overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950 shadow-2xl shadow-emerald-500/10">
        <div className="flex h-full max-h-full flex-col overflow-hidden">
          <div className="flex items-start justify-between gap-4 border-b border-slate-800/70 px-6 py-6 sm:px-8">
            <div>
              <h2 id="item-modal-title" className="text-2xl font-semibold text-slate-50">
                Neues Item hinzufügen
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Fülle alle Pflichtfelder aus, um ein neues Item zu erstellen und in die Datenbank aufzunehmen.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-400 transition hover:bg-slate-900 hover:text-slate-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
              aria-label="Modal schließen"
            >
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
            <form className="space-y-6" aria-label="Item hinzufügen" onSubmit={handleSubmit}>
              {metadataLoadingActive && (
                <div className="rounded-lg border border-slate-800/70 bg-slate-900/60 px-4 py-3 text-sm text-slate-300" aria-live="polite">
                  Stammdaten werden geladen …
                </div>
              )}

              {metadataErrorActive && (
                <div className="flex flex-col gap-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200" role="alert">
                  <p>{referenceError ?? 'Stammdaten konnten nicht geladen werden.'}</p>
                  <div>
                    <button
                      type="button"
                      onClick={onReloadMetadata}
                      disabled={referenceLoading}
                      className="inline-flex items-center gap-2 rounded-md border border-rose-500/50 bg-transparent px-3 py-1 text-xs font-semibold text-rose-100 transition hover:border-rose-300 hover:text-rose-50 focus:outline-none focus-visible:ring focus-visible:ring-rose-400/60 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      Erneut versuchen
                    </button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block" htmlFor="modal-item-title">
                  <span className="text-sm font-medium text-slate-300">Name *</span>
                  <input
                    id="modal-item-title"
                    name="title"
                    ref={titleInputRef}
                    type="text"
                    required
                    className={getFieldClassName('title')}
                    placeholder="Z. B. OP Netherite Helm"
                    value={formValues.title}
                    onChange={handleFieldChange}
                    aria-invalid={Boolean(errors.title)}
                    aria-describedby={getErrorId('title')}
                  />
                  {errors.title && (
                    <p id="item-modal-title-error" className="mt-2 text-sm text-rose-400">
                      {errors.title}
                    </p>
                  )}
                </label>

                <label className="block" htmlFor="modal-item-type">
                  <span className="text-sm font-medium text-slate-300">Item-Typ *</span>
                  <select
                    id="modal-item-type"
                    name="itemType"
                    required
                    className={getFieldClassName('itemType')}
                    value={formValues.itemType}
                    onChange={handleFieldChange}
                    aria-invalid={Boolean(errors.itemType)}
                    aria-describedby={getErrorId('itemType')}
                    disabled={metadataSelectDisabled}
                  >
                    <option value="">{metadataPlaceholderLabel}</option>
                    {itemTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errors.itemType && (
                    <p id="item-modal-itemType-error" className="mt-2 text-sm text-rose-400">
                      {errors.itemType}
                    </p>
                  )}
                </label>

                <label className="block" htmlFor="modal-item-material">
                  <span className="text-sm font-medium text-slate-300">Material *</span>
                  <select
                    id="modal-item-material"
                    name="material"
                    required
                    className={getFieldClassName('material')}
                    value={formValues.material}
                    onChange={handleFieldChange}
                    aria-invalid={Boolean(errors.material)}
                    aria-describedby={getErrorId('material')}
                    disabled={metadataSelectDisabled}
                  >
                    <option value="">{metadataPlaceholderLabel}</option>
                    {materialOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errors.material && (
                    <p id="item-modal-material-error" className="mt-2 text-sm text-rose-400">
                      {errors.material}
                    </p>
                  )}
                </label>

                <label className="block" htmlFor="modal-item-rarity">
                  <span className="text-sm font-medium text-slate-300">Seltenheit *</span>
                  <select
                    id="modal-item-rarity"
                    name="rarity"
                    required
                    className={getFieldClassName('rarity')}
                    value={formValues.rarity}
                    onChange={handleFieldChange}
                    aria-invalid={Boolean(errors.rarity)}
                    aria-describedby={getErrorId('rarity')}
                    disabled={metadataSelectDisabled}
                  >
                    <option value="">{metadataPlaceholderLabel}</option>
                    {rarityOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {errors.rarity && (
                    <p id="item-modal-rarity-error" className="mt-2 text-sm text-rose-400">
                      {errors.rarity}
                    </p>
                  )}
                </label>

                <div>
                  <span id="modal-item-star-level-label" className="text-sm font-medium text-slate-300">
                    Stern-Level
                  </span>
                  <div
                    className="mt-2 flex flex-wrap gap-3"
                    role="radiogroup"
                    aria-labelledby="modal-item-star-level-label"
                    aria-describedby={errors.starLevel ? 'item-modal-starLevel-error' : undefined}
                    aria-invalid={Boolean(errors.starLevel)}
                  >
                    {STAR_LEVEL_VALUES.map((value) => {
                      const optionId = `modal-item-star-level-${value}`
                      const isSelected = starLevelValue === value
                      const starStates = Array.from(
                        { length: MAX_STAR_LEVEL },
                        (_, index) => index < value
                      )
                      const optionLabel =
                        value === 0
                          ? 'Kein Stern'
                          : value === 1
                          ? '1 Stern'
                          : `${value} Sterne`

                      const optionClassName = [
                        'flex items-center gap-1 rounded-lg border px-3 py-2 transition',
                        'peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/50 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-slate-900',
                        isSelected
                          ? 'border-emerald-500/70 bg-emerald-500/10 ring-1 ring-emerald-500/40 ring-offset-2 ring-offset-slate-900'
                          : 'border-slate-800/60 bg-slate-900/60 hover:border-emerald-500/60 hover:bg-slate-900/80'
                      ]
                        .filter(Boolean)
                        .join(' ')

                      return (
                        <label key={value} htmlFor={optionId} className="inline-flex cursor-pointer">
                          <input
                            id={optionId}
                            type="radio"
                            name="starLevel"
                            value={value}
                            checked={isSelected}
                            onChange={() => updateStarLevel(value)}
                            className="peer sr-only"
                          />
                          <span aria-hidden="true" className={optionClassName}>
                            {starStates.map((filled, index) =>
                              filled ? (
                                <StarSolidIcon
                                  key={index}
                                  className="h-6 w-6 text-amber-300 transition-colors duration-150"
                                />
                              ) : (
                                <StarOutlineIcon
                                  key={index}
                                  className="h-6 w-6 text-slate-600 transition-colors duration-150"
                                />
                              )
                            )}
                          </span>
                          <span className="sr-only">{optionLabel}</span>
                        </label>
                      )
                    })}
                    <span className="sr-only" aria-live="polite">
                      {starLevelValue === 0
                        ? `Kein Stern ausgewählt.`
                        : `${starLevelValue} von ${MAX_STAR_LEVEL} Sternen ausgewählt.`}
                    </span>
                  </div>
                  <span className="sr-only" aria-live="polite">
                    {starLevelValue === 0
                      ? `Kein Stern ausgewählt.`
                      : `${starLevelValue} von ${MAX_STAR_LEVEL} Sternen ausgewählt.`}
                  </span>
                  <p className="mt-2 text-xs text-slate-500">
                    Optional – wähle bis zu {MAX_STAR_LEVEL} Sterne oder setze die Auswahl auf 0, um keine Sterne zu vergeben.
                  </p>
                  {errors.starLevel && (
                    <p id="item-modal-starLevel-error" className="mt-2 text-sm text-rose-400">
                      {errors.starLevel}
                    </p>
                  )}
                </div>

                <label className="block" htmlFor="modal-item-price">
                  <span className="text-sm font-medium text-slate-300">Preis</span>
                  <input
                    id="modal-item-price"
                    name="price"
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    className={getFieldClassName('price')}
                    placeholder="0.00"
                    value={formValues.price}
                    onChange={handleFieldChange}
                    aria-invalid={Boolean(errors.price)}
                    aria-describedby={getErrorId('price')}
                  />
                  {errors.price && (
                    <p id="item-modal-price-error" className="mt-2 text-sm text-rose-400">
                      {errors.price}
                    </p>
                  )}
                </label>

                <label className="sm:col-span-2 block" htmlFor="modal-item-image-url">
                  <span className="text-sm font-medium text-slate-300">Item-Bild URL</span>
                  <input
                    id="modal-item-image-url"
                    name="itemImageUrl"
                    type="url"
                    inputMode="url"
                    className={getFieldClassName('itemImageUrl')}
                    placeholder="https://..."
                    value={formValues.itemImageUrl}
                    onChange={handleFieldChange}
                    aria-invalid={Boolean(errors.itemImageUrl)}
                    aria-describedby={getErrorId('itemImageUrl')}
                  />
                  <p className="mt-2 text-xs text-slate-500">Optional – hinterlege einen direkten Link zum Item-Bild.</p>
                  {errors.itemImageUrl && (
                    <p id="item-modal-itemImageUrl-error" className="mt-2 text-sm text-rose-400">
                      {errors.itemImageUrl}
                    </p>
                  )}
                </label>

                <label className="sm:col-span-2 block" htmlFor="modal-item-lore-image-url">
                  <span className="text-sm font-medium text-slate-300">Lore-Bild URL</span>
                  <input
                    id="modal-item-lore-image-url"
                    name="itemLoreImageUrl"
                    type="url"
                    inputMode="url"
                    className={getFieldClassName('itemLoreImageUrl')}
                    placeholder="https://..."
                    value={formValues.itemLoreImageUrl}
                    onChange={handleFieldChange}
                    aria-invalid={Boolean(errors.itemLoreImageUrl)}
                    aria-describedby={getErrorId('itemLoreImageUrl')}
                  />
                  <p className="mt-2 text-xs text-slate-500">Optional – Link zu einem zusätzlichen Lore-Bild.</p>
                  {errors.itemLoreImageUrl && (
                    <p id="item-modal-itemLoreImageUrl-error" className="mt-2 text-sm text-rose-400">
                      {errors.itemLoreImageUrl}
                    </p>
                  )}
                </label>

                <label className="sm:col-span-2 block" htmlFor="modal-item-image">
                  <span className="text-sm font-medium text-slate-300">Item-Bild hochladen</span>
                  <input
                    id="modal-item-image"
                    name="itemImage"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="mt-1 block w-full cursor-pointer rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-md file:border-0 file:bg-emerald-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-950 hover:file:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    {fileValues.itemImage
                      ? `Ausgewählte Datei: ${fileValues.itemImage.name}`
                      : 'Unterstützte Formate: PNG, JPG, GIF'}
                  </p>
                </label>

                <label className="sm:col-span-2 block" htmlFor="modal-item-lore-image">
                  <span className="text-sm font-medium text-slate-300">Lore-Bild hochladen</span>
                  <input
                    id="modal-item-lore-image"
                    name="itemLoreImage"
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="mt-1 block w-full cursor-pointer rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300 file:mr-4 file:rounded-md file:border-0 file:bg-emerald-500 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-emerald-950 hover:file:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    {fileValues.itemLoreImage
                      ? `Ausgewählte Datei: ${fileValues.itemLoreImage.name}`
                      : 'Optional: Lade ein zusätzliches Lore-Bild hoch'}
                  </p>
                </label>
              </div>

              <div className="space-y-4">
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <span className="text-sm font-medium text-slate-300">Verzauberungen</span>
                  <span className="text-xs text-slate-500">Optional – wähle Einträge aus der Liste</span>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-900/60">
                  <div className="border-b border-slate-800/80 p-3">
                    <label className="block" htmlFor="modal-enchantments-search">
                      <span className="sr-only">Verzauberungen durchsuchen</span>
                      <div className="relative">
                        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-slate-500">
                          <SearchIcon className="h-4 w-4" />
                        </span>
                        <input
                          id="modal-enchantments-search"
                          type="search"
                          autoComplete="off"
                          className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                          placeholder="Suchen..."
                          value={enchantmentsSearch}
                          onChange={handleEnchantmentSearchChange}
                          data-enchantment-search
                        />
                      </div>
                    </label>
                  </div>
                  <div
                    className="max-h-48 overflow-y-auto p-2 text-sm"
                    data-enchantment-list
                    aria-live="polite"
                  >
                    {enchantmentsLoading ? (
                      <p className="px-2 py-4 text-xs text-slate-500">Verzauberungen werden geladen ...</p>
                    ) : enchantmentsError ? (
                      <p className="px-2 py-4 text-xs text-slate-500">{enchantmentsError}</p>
                    ) : filteredEnchantments.length === 0 ? (
                      <p className="px-2 py-4 text-xs text-slate-500">
                        {enchantments.length === 0
                          ? 'Keine Verzauberungen verfügbar.'
                          : 'Keine Verzauberungen gefunden.'}
                      </p>
                    ) : (
                      <ul className="space-y-2">
                        {filteredEnchantments.map((enchantment) => {
                          const checkboxId = `modal-enchantment-${enchantment.id}`
                          const isSelected = selectedEnchantments.has(enchantment.id)
                          const levelValue = selectedEnchantments.get(enchantment.id) ?? 1

                          return (
                            <li
                              key={enchantment.id}
                              className="flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-950/50 px-3 py-2"
                            >
                              <label
                                className="flex flex-1 items-center gap-3 text-sm text-slate-200"
                                htmlFor={checkboxId}
                              >
                                <input
                                  id={checkboxId}
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                                  checked={isSelected}
                                  onChange={(event) =>
                                    handleEnchantmentToggle(enchantment, event.target.checked)
                                  }
                                />
                                <span className="flex min-w-0 flex-col">
                                  <span className="truncate">{enchantment.label}</span>
                                  {enchantment.description && (
                                    <span className="mt-1 text-xs text-slate-500">
                                      {enchantment.description}
                                    </span>
                                  )}
                                </span>
                              </label>
                              <select
                                className="rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                                value={String(levelValue)}
                                onChange={(event) =>
                                  handleEnchantmentLevelChange(enchantment, event.target.value)
                                }
                                disabled={!isSelected}
                                aria-label={`Level für ${enchantment.label}`}
                              >
                                {Array.from({ length: enchantment.maxLevel }, (_, index) => index + 1).map(
                                  (levelOption) => (
                                    <option key={levelOption} value={levelOption}>
                                      {levelOption}
                                    </option>
                                  )
                                )}
                              </select>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>
                <div className="space-y-3" data-selected-enchantments aria-live="polite">
                  {selectedEnchantmentEntries.length === 0 ? (
                    <p className="text-xs text-slate-500">Noch keine Verzauberungen ausgewählt.</p>
                  ) : (
                    selectedEnchantmentEntries.map(({ enchantment, level }) => (
                      <div
                        key={enchantment.id}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-200">
                            {enchantment.label}
                          </p>
                          <p className="text-xs text-slate-500">
                            Level {level} von {enchantment.maxLevel}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSelectedEnchantment(enchantment.id)}
                          className="inline-flex items-center rounded-full border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
                        >
                          Entfernen
                        </button>
                      </div>
                    ))
                  )}
                </div>
                <p
                  id="item-enchantments-error"
                  className={`text-xs text-rose-400${enchantmentError ? '' : ' hidden'}`}
                  data-error-for="enchantments"
                >
                  {enchantmentError ?? ''}
                </p>
              </div>

              <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
                >
                  Abbrechen
                </button>
                <button
                  type="submit"
                  disabled={submitting || !metadataLoaded}
                  className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting && <SpinnerIcon className="h-4 w-4" />}
                  Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

type ResolvedItemEnchantment = {
  key: string
  id: number | null
  slug: string | null
  label: string
  description: string | null
  level: number
  maxLevel: number | null
}

type ParsedEnchantmentMeta = {
  id: number | null
  label: string | null
  slug: string | null
  description: string | null
  maxLevel: number | null
}

const toPositiveInteger = (value: unknown): number | null => parsePositiveInteger(value)
const toTrimmedString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

const parseEnchantmentMeta = (input: unknown): ParsedEnchantmentMeta | null => {
  if (!input || typeof input !== 'object') {
    return null
  }

  const record = input as Record<string, unknown>

  const idKeys = ['id', 'enchantment_id', 'enchantmentId', 'enchant_id']
  let id: number | null = null
  for (const key of idKeys) {
    const candidate = record[key]
    const parsed = toPositiveInteger(candidate)
    if (parsed !== null) {
      id = parsed
      break
    }
  }

  const labelKeys = ['label', 'name', 'name_de', 'nameDe', 'title']
  let label: string | null = null
  for (const key of labelKeys) {
    const candidate = record[key]
    const normalized = toTrimmedString(candidate)
    if (normalized) {
      label = normalized
      break
    }
  }

  const slug = toTrimmedString(record['slug']) ?? toTrimmedString(record['key']) ?? null

  const descriptionKeys = ['description', 'desc', 'lore', 'text', 'details']
  let description: string | null = null
  for (const key of descriptionKeys) {
    if (key in record) {
      const normalized = toTrimmedString(record[key])
      if (normalized) {
        description = normalized
        break
      }
    }
  }

  const maxKeys = ['max_level', 'maxLevel', 'max', 'level_cap']
  let maxLevel: number | null = null
  for (const key of maxKeys) {
    const candidate = record[key]
    const parsed = toPositiveInteger(candidate)
    if (parsed !== null) {
      maxLevel = parsed
      break
    }
  }

  if (!label && id) {
    label = `Verzauberung ${id}`
  }

  return { id, label, slug, description, maxLevel }
}

const parseItemEnchantment = (entry: unknown): ResolvedItemEnchantment | null => {
  if (typeof entry === 'string') {
    const normalized = entry.trim()
    if (!normalized) {
      return null
    }

    return {
      key: `label:${normalized.toLowerCase()}`,
      id: null,
      slug: null,
      label: normalized,
      description: null,
      level: 1,
      maxLevel: null,
    }
  }

  if (!entry || typeof entry !== 'object') {
    return null
  }

  const record = entry as Record<string, unknown>
  let level: number | null = null
  for (const key of ENCHANTMENT_LEVEL_KEYS) {
    const candidate = record[key]
    const parsed = toPositiveInteger(candidate)
    if (parsed !== null) {
      level = parsed
      break
    }
  }

  if (level === null) {
    return null
  }

  const meta =
    parseEnchantmentMeta(record['enchantment']) ??
    parseEnchantmentMeta(record['enchantments']) ??
    parseEnchantmentMeta(record['meta']) ??
    parseEnchantmentMeta(record['details']) ??
    null

  const fallbackIdKeys = ['enchantment_id', 'enchantmentId', 'enchant_id']
  let fallbackId: number | null = null
  for (const key of fallbackIdKeys) {
    const candidate = record[key]
    const parsed = toPositiveInteger(candidate)
    if (parsed !== null) {
      fallbackId = parsed
      break
    }
  }

  const metaId = meta?.id ?? fallbackId

  const inlineLabelKeys = ['label', 'name', 'name_de', 'nameDe', 'title']
  let inlineLabel: string | null = null
  for (const key of inlineLabelKeys) {
    const normalized = toTrimmedString(record[key])
    if (normalized) {
      inlineLabel = normalized
      break
    }
  }

  const label =
    meta?.label ??
    inlineLabel ??
    (metaId ? `Verzauberung ${metaId}` : null) ??
    `Verzauberung (Level ${level})`

  const slug = meta?.slug ?? null

  let description = meta?.description ?? null
  if (!description) {
    description = toTrimmedString(record['description']) ?? toTrimmedString(record['details']) ?? null
  }

  let maxLevel = meta?.maxLevel ?? null
  if (maxLevel === null) {
    const maxKeys = ['max_level', 'maxLevel', 'max']
    for (const key of maxKeys) {
      const candidate = record[key]
      const parsed = toPositiveInteger(candidate)
      if (parsed !== null) {
        maxLevel = parsed
        break
      }
    }
  }

  if (maxLevel !== null && maxLevel < level) {
    maxLevel = level
  }

  const keyParts: string[] = []
  if (metaId !== null) {
    keyParts.push(`id:${metaId}`)
  } else if (slug) {
    keyParts.push(`slug:${slug.toLowerCase()}`)
  }
  keyParts.push(`label:${label.toLowerCase()}`)
  keyParts.push(`level:${level}`)
  const key = keyParts.join('|')

  return {
    key,
    id: metaId,
    slug,
    label,
    description,
    level,
    maxLevel,
  }
}

const resolveItemEnchantments = (item: Item): ResolvedItemEnchantment[] => {
  const sources: unknown[] = []

  const rawItemEnchantments = (item as Record<string, unknown>).item_enchantments
  if (Array.isArray(rawItemEnchantments)) {
    sources.push(...rawItemEnchantments)
  }

  const rawItemEnchantmentsCamel = (item as Record<string, unknown>).itemEnchantments
  if (Array.isArray(rawItemEnchantmentsCamel)) {
    sources.push(...rawItemEnchantmentsCamel)
  }

  const rawEnchantments = (item as Record<string, unknown>).enchantments
  if (Array.isArray(rawEnchantments)) {
    sources.push(...rawEnchantments)
  }

  const parsed = sources
    .map((entry) => parseItemEnchantment(entry))
    .filter((entry): entry is ResolvedItemEnchantment => entry !== null)

  const deduped = new Map<string, ResolvedItemEnchantment>()
  parsed.forEach((entry) => {
    if (!deduped.has(entry.key)) {
      deduped.set(entry.key, entry)
    }
  })

  return Array.from(deduped.values()).sort((a, b) => {
    const labelCompare = a.label.localeCompare(b.label, 'de', { sensitivity: 'base' })
    if (labelCompare !== 0) {
      return labelCompare
    }

    return a.level - b.level
  })
}

function ItemCard({
  item,
  typeLabelMap,
  materialLabelMap,
  rarityLabelMap,
  rarityOptions,
  onImagePreview
}: {
  item: Item
  typeLabelMap: Record<string, string>
  materialLabelMap: Record<string, string>
  rarityLabelMap: Record<string, string>
  rarityOptions: FilterOption[]
  onImagePreview: (details: ImagePreviewDetails) => void
}) {
  const rarityId =
    typeof item.rarity_id === 'number'
      ? item.rarity_id
      : typeof item.rarityId === 'number'
        ? item.rarityId
        : typeof item.rarities?.id === 'number'
          ? item.rarities?.id ?? null
          : null
  const rarityValues = [item.rarity, item.rarities?.code, item.rarities?.label, item.rarities?.slug]
  const { label, badgeClass } = getRarityMeta(
    rarityValues,
    rarityId,
    rarityOptions,
    rarityLabelMap
  )


  const itemImageUrl = (() => {
    const candidates = [item.item_image, item.image_url]
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
  })()

  const itemLoreImageUrl = (() => {
    const candidates = [item.item_lore_image, item.lore_image_url]
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
  })()

  const uniqueLoreImageUrl =
    itemLoreImageUrl && itemLoreImageUrl !== itemImageUrl ? itemLoreImageUrl : null

  const resolveAttributeLabel = (
    numericCandidates: Array<number | string | null | undefined>,
    stringCandidates: Array<string | null | undefined>,
    labelMap: Record<string, string>,
    fallbackPrefix: string,
    unknownFallback: string
  ) => {
    for (const candidate of numericCandidates) {
      const numericCandidate = extractSupabaseNumericCandidate(candidate)
      if (numericCandidate) {
        const mapped = labelMap[numericCandidate]
        if (mapped) {
          return mapped
        }
      }
    }

    for (const candidate of stringCandidates) {
      if (typeof candidate === 'string') {
        const normalized = candidate.trim()
        if (!normalized) {
          continue
        }

        if (labelMap[normalized]) {
          return labelMap[normalized]
        }
      }
    }

    for (const candidate of stringCandidates) {
      if (typeof candidate === 'string') {
        const normalized = candidate.trim()
        if (normalized) {
          return normalized
        }
      }
    }

    for (const candidate of numericCandidates) {
      const numericCandidate = extractSupabaseNumericCandidate(candidate)
      if (numericCandidate) {
        return `${fallbackPrefix} #${numericCandidate}`
      }
    }

    return unknownFallback
  }

  const typeLabel = resolveAttributeLabel(
    [item.item_type_id, item.itemTypeId, item.item_types?.id],
    [item.type, item.item_types?.label, item.item_types?.code, item.item_types?.slug],
    typeLabelMap,
    'Typ',
    'Unbekannter Typ'
  )

  const materialLabel = resolveAttributeLabel(
    [item.material_id, item.materialId, item.materials?.id],
    [
      item.material,
      item.materials?.label,
      item.materials?.code,
      item.materials?.slug
    ],
    materialLabelMap,
    'Material',
    'Unbekanntes Material'
  )

  const starLevel =
    typeof item.star_level === 'number'
      ? Math.max(0, Math.min(MAX_STAR_LEVEL, item.star_level))
      : 0
  const starStates = Array.from({ length: MAX_STAR_LEVEL }, (_, index) => index < starLevel)

  const normalizedTitle = item.title.trim() || 'Unbenanntes Item'
  const titleInitial = normalizedTitle.charAt(0).toUpperCase() || 'I'
  const slugLabel = typeof item.slug === 'string' ? item.slug.trim() : ''
  const description = toTrimmedString(item.description) ?? ''
  const enchantmentEntries = resolveItemEnchantments(item)
  const hasEnchantments = enchantmentEntries.length > 0
  const enchantmentCountLabel = hasEnchantments
    ? `${enchantmentEntries.length} ${enchantmentEntries.length === 1 ? 'Eintrag' : 'Einträge'}`
    : ''

  const metaEntries: Array<{ id: string; label: string; value: string; accent: string }> = [
    { id: 'rarity', label: 'Seltenheit', value: label, accent: 'text-amber-300' },
    { id: 'type', label: 'Item-Typ', value: typeLabel, accent: 'text-sky-300' },
    { id: 'material', label: 'Material', value: materialLabel, accent: 'text-indigo-300' },
  ]

  const baseImageButtonClassName =
    'relative block h-full w-full overflow-hidden focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60'

  const handleImagePreviewOpen = (
    event: MouseEvent<HTMLButtonElement>,
    details: ImagePreviewDetails
  ) => {
    event.preventDefault()
    event.stopPropagation()
    onImagePreview(details)
  }

  const handleImagePreviewMouseDown = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.button === 1) {
      event.preventDefault()
    }
  }

  return (
    <article className="relative overflow-hidden rounded-3xl border border-slate-800/70 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-emerald-500/10">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
        <div className="absolute -left-24 top-0 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl" />
        <div className="absolute -right-28 bottom-0 h-52 w-52 rounded-full bg-indigo-500/10 blur-3xl" />
      </div>
      <div className="relative z-10 flex flex-col gap-6">
        <header className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
          <div className="flex w-full flex-col gap-3 lg:w-48">
            <div className="group relative overflow-hidden rounded-2xl border border-slate-800/60 bg-slate-950/60 shadow-inner shadow-slate-950/50">
              <div className="aspect-square w-full">
                {itemImageUrl ? (
                  <button
                    type="button"
                    onClick={(event) =>
                      handleImagePreviewOpen(event, {
                        url: itemImageUrl,
                        title: normalizedTitle
                      })
                    }
                    onAuxClick={(event) =>
                      handleImagePreviewOpen(event, {
                        url: itemImageUrl,
                        title: normalizedTitle
                      })
                    }
                    onMouseDown={handleImagePreviewMouseDown}
                    className={baseImageButtonClassName}
                    aria-haspopup="dialog"
                    aria-label="Itembild vergrößern"
                    title="Itembild vergrößern"
                  >
                    <img
                      src={itemImageUrl}
                      alt={`Abbildung von ${normalizedTitle}`}
                      loading="lazy"
                      draggable={false}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <span
                      className="pointer-events-none absolute left-3 top-3 rounded-full bg-slate-950/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-slate-200 shadow-lg shadow-slate-950/40 ring-1 ring-inset ring-slate-800/70"
                      aria-hidden="true"
                    >
                      Itembild
                    </span>
                  </button>
                ) : (
                  <div className="relative flex h-full w-full items-center justify-center text-5xl font-semibold text-emerald-200">
                    <span aria-hidden="true">{titleInitial}</span>
                    <span className="sr-only">Kein Itembild verfügbar</span>
                  </div>
                )}
              </div>
              {starLevel > 0 && (
                <div className="absolute -bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-slate-950/90 px-3 py-1 text-amber-300 shadow-lg shadow-amber-500/10 ring-1 ring-inset ring-amber-400/40">
                  {starStates.map((active, index) => (
                    <span key={index} aria-hidden="true">
                      {active ? '★' : '☆'}
                    </span>
                  ))}
                  <span className="sr-only">{`Stern-Level ${starLevel} von ${MAX_STAR_LEVEL}`}</span>
                </div>
              )}
            </div>
            {uniqueLoreImageUrl ? (
              <div className="group relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-emerald-500/5 shadow-inner shadow-emerald-500/10">
                <div className="aspect-square w-full">
                  <button
                    type="button"
                    onClick={(event) =>
                      handleImagePreviewOpen(event, {
                        url: uniqueLoreImageUrl,
                        title: `${normalizedTitle} – Lore-Bild`
                      })
                    }
                    onAuxClick={(event) =>
                      handleImagePreviewOpen(event, {
                        url: uniqueLoreImageUrl,
                        title: `${normalizedTitle} – Lore-Bild`
                      })
                    }
                    onMouseDown={handleImagePreviewMouseDown}
                    className={baseImageButtonClassName}
                    aria-haspopup="dialog"
                    aria-label="Lore-Bild vergrößern"
                    title="Lore-Bild vergrößern"
                  >
                    <img
                      src={uniqueLoreImageUrl}
                      alt={`Lore-Abbildung von ${normalizedTitle}`}
                      loading="lazy"
                      draggable={false}
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                    <span
                      className="pointer-events-none absolute left-3 top-3 rounded-full bg-emerald-950/70 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.35em] text-emerald-200 shadow-lg shadow-emerald-900/40 ring-1 ring-inset ring-emerald-400/50"
                      aria-hidden="true"
                    >
                      Lore-Bild
                    </span>
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="flex flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                {slugLabel ? (
                  <p className="text-[11px] uppercase tracking-[0.4em] text-slate-500">{slugLabel}</p>
                ) : null}
                <h3 className="text-2xl font-semibold text-slate-50">{normalizedTitle}</h3>
              </div>
              <span className={`inline-flex items-center rounded-full px-4 py-1.5 text-xs font-semibold shadow-sm ${badgeClass}`}>
                {label}
              </span>
            </div>
            <dl className="grid gap-3 text-sm text-slate-300 sm:grid-cols-2 xl:grid-cols-3">
              {metaEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-slate-800/60 bg-slate-950/60 p-3 shadow-inner shadow-slate-950/40"
                >
                  <dt className="flex items-center gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                    <BadgeDot className={`h-1.5 w-1.5 ${entry.accent}`} />
                    {entry.label}
                  </dt>
                  <dd className="mt-1 text-base font-semibold text-slate-100">{entry.value}</dd>
                </div>
              ))}
            </dl>
          </div>
        </header>

        {description ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">{description}</p>
        ) : null}

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-300/80">Verzauberungen</p>
            {hasEnchantments ? (
              <span className="text-xs text-emerald-200/70">{enchantmentCountLabel}</span>
            ) : null}
          </div>
          {hasEnchantments ? (
            <ul className="grid gap-2 sm:grid-cols-2">
              {enchantmentEntries.map((enchantment) => (
                <li
                  key={enchantment.key}
                  className="group rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3 backdrop-blur-sm transition hover:border-emerald-400/40 hover:bg-emerald-500/20"
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-semibold text-emerald-100">{enchantment.label}</p>
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-950/60 px-3 py-1 text-xs font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-400/30">
                        Level {enchantment.level}
                        {enchantment.maxLevel ? (
                          <span className="text-emerald-300/80">/ {enchantment.maxLevel}</span>
                        ) : null}
                      </span>
                    </div>
                    {enchantment.description ? (
                      <p className="text-xs text-emerald-100/70">{enchantment.description}</p>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-3 text-xs text-slate-500">
              Für dieses Item wurden keine Verzauberungen hinterlegt.
            </p>
          )}
        </section>
      </div>
    </article>
  )
}

function SearchIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m21 21-4.35-4.35" />
      <circle cx="11" cy="11" r="7" />
    </svg>
  )
}

function PlusIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </svg>
  )
}

function CheckIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12.5 2.5 2.5 5-5" />
    </svg>
  )
}

function AlertIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  )
}

function CloseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </svg>
  )
}

function SpinnerIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  const composedClassName = ['animate-spin', className].filter(Boolean).join(' ')
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={composedClassName}
      aria-hidden="true"
      {...props}
    >
      <path d="M12 3a9 9 0 1 1-9 9" />
    </svg>
  )
}

function StarSolidIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M12 2.25 14.67 7.678l5.989.87-4.33 4.222 1.023 5.956L12 15.75l-5.352 2.976 1.023-5.956-4.33-4.222 5.99-.87L12 2.25z" />
    </svg>
  )
}

function StarOutlineIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.042 4.136 4.566.665a.562.562 0 0 1 .311.959l-3.3 3.22.78 4.543a.562.562 0 0 1-.815.592L12 15.347l-4.093 2.287a.562.562 0 0 1-.815-.592l.78-4.543-3.3-3.22a.562.562 0 0 1 .311-.959l4.565-.665 2.042-4.136z" />
    </svg>
  )
}

function BadgeDot(props: SVGProps<SVGSVGElement>) {
  const { className, ...rest } = props
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 8 8"
      fill="currentColor"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <circle cx="4" cy="4" r="4" />
    </svg>
  )
}

const META_ENDPOINTS = {
  item_types: '/api/item_types',
  materials: '/api/materials',
  rarities: '/api/rarities',
}

const DEFAULT_MAX_AGE = 60000
const memoryCache = new Map()
const pendingRequests = new Map()

async function fetchList(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return res.json()
}

function cacheGet(key, maxAgeMs = DEFAULT_MAX_AGE) {
  try {
    const raw = sessionStorage.getItem(key)
    const ts = Number(sessionStorage.getItem(`${key}:ts`) || 0)
    if (!raw || !ts || Date.now() - ts > maxAgeMs) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function cacheSet(key, val) {
  try {
    sessionStorage.setItem(key, JSON.stringify(val))
    sessionStorage.setItem(`${key}:ts`, String(Date.now()))
  } catch {}
}

function memoryGet(key, maxAgeMs = DEFAULT_MAX_AGE) {
  const entry = memoryCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > maxAgeMs) {
    memoryCache.delete(key)
    return null
  }
  return entry.value
}

function memorySet(key, val) {
  memoryCache.set(key, { value: val, ts: Date.now() })
}

function storeCache(key, val) {
  memorySet(key, val)
  cacheSet(key, val)
}

function fillSelect(select, list, { keepFirst = false } = {}) {
  if (!select) return
  const first = keepFirst ? select.querySelector('option[value=""]') : null
  select.innerHTML = ''
  if (first) select.appendChild(first)
  for (const row of list) {
    if (!row || typeof row !== 'object') continue
    const option = document.createElement('option')
    option.value = String(row.id)
    option.textContent = row.label
    select.appendChild(option)
  }
  select.disabled = false
}

async function getList(endpointKey, { maxAgeMs = DEFAULT_MAX_AGE, refresh = false } = {}) {
  const endpoint = META_ENDPOINTS[endpointKey]
  if (!endpoint) throw new Error(`Unknown metadata endpoint: ${endpointKey}`)
  const cacheKey = `meta:${endpointKey}`

  if (!refresh) {
    const memoryValue = memoryGet(cacheKey, maxAgeMs)
    if (memoryValue) return memoryValue
    const stored = cacheGet(cacheKey, maxAgeMs)
    if (stored) {
      memorySet(cacheKey, stored)
      return stored
    }
  }

  if (!pendingRequests.has(cacheKey) || refresh) {
    const request = fetchList(endpoint)
      .then((list) => {
        const normalized = Array.isArray(list) ? list : []
        storeCache(cacheKey, normalized)
        return normalized
      })
      .finally(() => {
        pendingRequests.delete(cacheKey)
      })
    pendingRequests.set(cacheKey, request)
  }

  return pendingRequests.get(cacheKey)
}

async function hydrateSelect(selectId, endpointKey, opts) {
  const el = document.getElementById(selectId)
  if (!el) return
  el.disabled = true
  try {
    const list = await getList(endpointKey)
    fillSelect(el, Array.isArray(list) ? list : [], opts)
  } catch (error) {
    console.error(`[metadata] init failed for ${endpointKey}`, error)
  } finally {
    el.disabled = false
  }
}

export async function getMetadataList(endpointKey, options = {}) {
  return getList(endpointKey, options)
}

export async function initMetadata() {
  await Promise.all([
    hydrateSelect('item-type-select', 'item_types'),
    hydrateSelect('item-material-select', 'materials'),
    hydrateSelect('item-rarity-select', 'rarities'),
    hydrateSelect('filter-type', 'item_types', { keepFirst: true }),
    hydrateSelect('filter-material', 'materials', { keepFirst: true }),
    hydrateSelect('filter-rarity', 'rarities', { keepFirst: true }),
  ])
}

document.addEventListener('DOMContentLoaded', () => {
  initMetadata().catch((error) => console.error('[metadata] init failed:', error))
})

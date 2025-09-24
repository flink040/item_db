import { supabase } from './supabaseClient.js'
import { getMetadataList } from '/assets/js/metadata.js'

const state = {
  filters: {
    typeId: null,
    materialId: null,
    rarityId: null,
    search: null,
  },
  itemTypes: [],
  materials: [],
  rarities: [],
  enchantments: [],
  enchantmentsLoaded: false,
  enchantmentsError: false,
  enchantmentsSearch: '',
  selectedEnchantments: new Map(),
  user: null,
  profile: null,
  profileRole: null,
  profileStats: null,
  itemsLoading: false,
  reloadRequested: false,
  authMenu: {
    trigger: null,
    menu: null,
  },
}

const elements = {
  filterType: document.getElementById('filter-type'),
  filterMaterial: document.getElementById('filter-material'),
  filterRarity: document.getElementById('filter-rarity'),
  searchInput: document.getElementById('app-search-input'),
  searchForm: document.querySelector('[data-js="search-form"]'),
  itemsList: document.getElementById('itemsList'),
  itemsEmpty: document.getElementById('itemsEmptyState'),
  addItemButton: document.getElementById('btn-add-item'),
  addItemModal: document.getElementById('addItemModal'),
  addItemForm: document.getElementById('addItemForm'),
  starRating: document.querySelector('[data-star-rating]'),
  starRatingInput: document.querySelector('[data-star-rating-input]'),
  enchantmentsSearchInput: document.getElementById('enchantmentsSearch'),
  enchantmentsList: document.getElementById('enchantmentsList'),
  formError: document.getElementById('addItemFormError'),
  submitButton: document.getElementById('addItemSubmit'),
  submitSpinner: document.querySelector('[data-loading-icon]'),
  toastContainer: document.getElementById('toast-container'),
  profileContainer: document.getElementById('profile-container'),
  mobileMenuButton: document.querySelector('[data-js="mobile-menu-btn"]'),
  mobileMenu: document.querySelector('[data-js="mobile-menu"]'),
}

const profileModalElements = (() => {
  const modal = document.querySelector('[data-profile-modal]')
  return {
    modal,
    overlay: modal?.querySelector('[data-profile-modal-overlay]') ?? null,
    closeButtons: modal ? Array.from(modal.querySelectorAll('[data-profile-close]')) : [],
    avatarFrame: modal?.querySelector('[data-profile-avatar]') ?? null,
    avatarImage: modal?.querySelector('[data-profile-avatar-image]') ?? null,
    avatarFallback: modal?.querySelector('[data-profile-avatar-fallback]') ?? null,
    displayName: modal?.querySelector('[data-profile-display-name]') ?? null,
    items: modal?.querySelector('[data-profile-items]') ?? null,
    likes: modal?.querySelector('[data-profile-likes]') ?? null,
    loading: modal?.querySelector('[data-profile-loading]') ?? null,
    error: modal?.querySelector('[data-profile-error]') ?? null,
  }
})()

const profileModalState = {
  isOpen: false,
  lastFocusedElement: null,
  activeFetchToken: 0,
}

const MODERATION_ROLES = new Set(['moderator', 'admin'])

const moderationElements = (() => {
  const modal = document.querySelector('[data-moderation-modal]')
  return {
    modal,
    overlay: modal?.querySelector('[data-moderation-overlay]') ?? null,
    closeButtons: modal ? Array.from(modal.querySelectorAll('[data-moderation-close]')) : [],
  }
})()

let moderationIsOpen = false
let moderationLastTrigger = null

let searchDebounceId = 0
let authSubscription = null
let menuMediaQuery = null
let menuMediaHandler = null
let ignoreNextMenuClick = false
const customFileInputs = new Map()
const starRatingControl = {
  container: null,
  input: null,
  buttons: [],
  value: null,
  hoverValue: null,
  initialised: false,
}

const MAX_STAR_RATING = 3
const DESKTOP_MENU_MEDIA_QUERY = '(min-width: 768px)'
const MAX_VISIBLE_ENCHANTMENTS = 5
const STORAGE_BUCKET_ITEM_MEDIA = 'item-media'
const STORAGE_UPLOAD_ROOT = 'items'
const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024
const MAX_IMAGE_SIZE_MB = 5
const ALLOWED_IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif']
const IMAGE_MIME_EXTENSION_MAP = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

const API_BASE = '/api'

const insertDiagnostics = {
  lastMethod: null,
  lastStatus: null,
  lastPayload: null,
  lastError: null,
  lastResponse: null,
  lastUserId: null,
}

async function fetchMetadataList(endpointKey) {
  try {
    const data = await getMetadataList(endpointKey)
    if (!Array.isArray(data)) {
      throw new Error(`Ungültige Antwort für ${endpointKey} erhalten.`)
    }
    return { data, error: null }
  } catch (error) {
    return { data: [], error }
  }
}

async function fetchRaritiesList() {
  return fetchMetadataList('rarities')
}

async function fetchItemTypesList() {
  return fetchMetadataList('item_types')
}

async function fetchMaterialsList() {
  return fetchMetadataList('materials')
}

function formatFileSize(bytes) {
  const size = Number(bytes)
  if (!Number.isFinite(size) || size < 0) {
    return ''
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let index = 0
  let value = size

  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }

  const decimals = value >= 10 || index === 0 ? 0 : 1
  return `${value.toFixed(decimals)} ${units[index]}`
}


function setMenuExpanded(expanded) {
  const button = elements.mobileMenuButton
  const menu = elements.mobileMenu
  if (!button || !menu) return

  const shouldExpand = Boolean(expanded)
  button.setAttribute('aria-expanded', String(shouldExpand))
  button.dataset.menuOpen = String(shouldExpand)

  menu.hidden = !shouldExpand
  menu.setAttribute('aria-hidden', String(!shouldExpand))
  menu.dataset.menuOpen = String(shouldExpand)
}

function toggleMenu(force) {
  const button = elements.mobileMenuButton
  if (!button) return

  const expanded = button.getAttribute('aria-expanded') === 'true'
  const shouldExpand = typeof force === 'boolean' ? force : !expanded
  setMenuExpanded(shouldExpand)
}

function syncMenuToViewport(matches) {
  if (matches) {
    setMenuExpanded(true)
    return
  }

  const button = elements.mobileMenuButton
  const expanded = button?.getAttribute('aria-expanded') === 'true'
  setMenuExpanded(expanded)
}

function bindMenuMediaQuery() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    const button = elements.mobileMenuButton
    const expanded = button?.getAttribute('aria-expanded') === 'true'
    setMenuExpanded(expanded)
    return
  }

  menuMediaQuery = menuMediaQuery ?? window.matchMedia(DESKTOP_MENU_MEDIA_QUERY)
  syncMenuToViewport(menuMediaQuery.matches)

  if (menuMediaHandler) {
    return
  }

  menuMediaHandler = (event) => {
    if (event.matches) {
      setMenuExpanded(true)
    } else {
      setMenuExpanded(false)
    }
  }

  if (typeof menuMediaQuery.addEventListener === 'function') {
    menuMediaQuery.addEventListener('change', menuMediaHandler)
  } else if (typeof menuMediaQuery.addListener === 'function') {
    menuMediaQuery.addListener(menuMediaHandler)
  }
}

function handleMenuButtonClick(event) {
  if (!(event.currentTarget instanceof HTMLElement)) {
    return
  }

  if (ignoreNextMenuClick) {
    ignoreNextMenuClick = false
    return
  }

  event.preventDefault()
  toggleMenu()
}

function handleMenuButtonKeydown(event) {
  const key = event.key
  if (key !== ' ' && key !== 'Spacebar' && key !== 'Enter') {
    return
  }

  ignoreNextMenuClick = true
  event.preventDefault()
  toggleMenu()
}

function handleMenuLinkClick(event) {
  const target = event.target
  if (!(target instanceof Element)) {
    return
  }

  const closeTrigger = target.closest('[data-menu-close="true"]')
  if (!closeTrigger) {
    return
  }

  if (menuMediaQuery?.matches) {
    return
  }

  toggleMenu(false)
}

function initializeMenuControls() {
  const button = elements.mobileMenuButton
  const menu = elements.mobileMenu
  if (!button || !menu) {
    return
  }

  if (button.dataset.menuBound !== 'true') {
    button.addEventListener('click', handleMenuButtonClick)
    button.addEventListener('keydown', handleMenuButtonKeydown)
    button.dataset.menuBound = 'true'
  }

  if (menu.dataset.menuBound !== 'true') {
    menu.addEventListener('click', handleMenuLinkClick)
    menu.dataset.menuBound = 'true'
  }

  bindMenuMediaQuery()
}

function setAriaBusy(isBusy) {
  if (elements.itemsList) {
    elements.itemsList.setAttribute('aria-busy', String(Boolean(isBusy)))
  }
}

function renderSkeleton(count = 6) {
  if (!elements.itemsList) return
  elements.itemsEmpty?.classList.add('hidden')
  const skeleton = Array.from({ length: count })
    .map(
      () => `
        <article class="item-card item-card--loading">
          <div class="item-card__loading-media"></div>
          <div class="item-card__loading-bar item-card__loading-bar--wide"></div>
          <div class="item-card__loading-bar item-card__loading-bar--medium"></div>
          <div class="item-card__loading-bar item-card__loading-bar--tall"></div>
          <div class="item-card__loading-bar item-card__loading-bar--footer"></div>
        </article>
      `
    )
    .join('')
  elements.itemsList.innerHTML = skeleton
}

function renderItemsError(message) {
  if (!elements.itemsList) return
  elements.itemsList.innerHTML = `
    <div class="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-200">
      ${message}
    </div>
  `
  elements.itemsEmpty?.classList.add('hidden')
}

function truncateText(value, max = 240) {
  if (!value) return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (trimmed.length <= max) return trimmed
  return `${trimmed.slice(0, max - 1)}…`
}

function renderStars(starCount) {
  const normalized = normalizeStarValue(starCount)
  const resolved = typeof normalized === 'number' ? normalized : 0
  return Array.from({ length: MAX_STAR_RATING }, (_, index) => (index < resolved ? '★' : '☆')).join('')
}

function normaliseItemStarFields(entry) {
  if (!entry || typeof entry !== 'object') {
    return entry
  }

  const result = { ...entry }
  const normalizedStars = normalizeStarValue(result.stars)
  const normalizedStarLevel = normalizeStarValue(result.star_level)
  const resolvedStars =
    typeof normalizedStars === 'number'
      ? normalizedStars
      : typeof normalizedStarLevel === 'number'
        ? normalizedStarLevel
        : 0

  result.stars = resolvedStars
  result.star_level =
    typeof normalizedStarLevel === 'number' ? normalizedStarLevel : resolvedStars

  return result
}

function toLookupKey(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  return null
}

function createLookupMap(entries) {
  const map = new Map()

  if (!Array.isArray(entries)) {
    return map
  }

  entries.forEach((entry) => {
    if (!entry || typeof entry !== 'object') {
      return
    }

    const key = toLookupKey(entry.id ?? entry.value ?? null)
    if (key) {
      map.set(key, entry)
    }
  })

  return map
}

function attachItemLookups(items) {
  if (!Array.isArray(items)) {
    return []
  }

  const typeMap = createLookupMap(state.itemTypes)
  const materialMap = createLookupMap(state.materials)
  const rarityMap = createLookupMap(state.rarities)

  return items.map((item) => {
    if (!item || typeof item !== 'object') {
      return item
    }

    const enriched = { ...item }

    const typeKey = toLookupKey(item.item_type_id ?? item.itemTypeId ?? null)
    if (typeKey && !enriched.item_types && typeMap.has(typeKey)) {
      enriched.item_types = typeMap.get(typeKey)
    }

    const materialKey = toLookupKey(item.material_id ?? item.materialId ?? null)
    if (materialKey && !enriched.materials && materialMap.has(materialKey)) {
      enriched.materials = materialMap.get(materialKey)
    }

    const rarityKey = toLookupKey(item.rarity_id ?? item.rarityId ?? null)
    if (rarityKey && !enriched.rarities && rarityMap.has(rarityKey)) {
      enriched.rarities = rarityMap.get(rarityKey)
    } else if (!enriched.rarities && typeof enriched.rarity === 'string') {
      const rarityLabel = enriched.rarity.trim()
      if (rarityLabel.length > 0) {
        enriched.rarities = { label: rarityLabel }
      }
    }

    return enriched
  })
}

function renderItems(items) {
  if (!elements.itemsList) return
  if (!Array.isArray(items) || items.length === 0) {
    elements.itemsList.innerHTML = ''
    elements.itemsEmpty?.classList.remove('hidden')
    return
  }

  elements.itemsEmpty?.classList.add('hidden')

  const fragments = document.createDocumentFragment()

  items.forEach((item) => {
    const card = document.createElement('article')
    card.className = 'item-card'

    const resolvedTitle = resolveItemTitle(item)
    const primaryImageUrl = resolvePrimaryImageUrl(item)
    const loreImageUrl = resolveLoreImageUrl(item)

    const header = document.createElement('div')
    header.className = 'item-card__header'

    const title = document.createElement('h3')
    title.className = 'item-card__title'
    title.textContent = resolvedTitle ?? 'Unbenanntes Item'
    header.appendChild(title)

    const normalizedStars = normalizeStarValue(item?.stars)
    const normalizedStarLevel = normalizeStarValue(item?.star_level)
    const starValue =
      typeof normalizedStars === 'number'
        ? normalizedStars
        : typeof normalizedStarLevel === 'number'
          ? normalizedStarLevel
          : 0

    const stars = document.createElement('span')
    stars.className = 'item-card__stars'
    stars.setAttribute('aria-label', `${starValue} von ${MAX_STAR_RATING} Sternen`)
    stars.textContent = renderStars(starValue)
    header.appendChild(stars)

    card.appendChild(header)

    const meta = document.createElement('div')
    meta.className = 'item-card__meta'

    const rarityLabel = item?.rarities?.label ?? 'Unbekannt'
    const typeLabel = item?.item_types?.label ?? 'Unbekannt'
    const materialLabel = item?.materials?.label ?? 'Unbekannt'

    meta.appendChild(createMetaBadge('Seltenheit', rarityLabel))
    meta.appendChild(createMetaBadge('Typ', typeLabel))
    meta.appendChild(createMetaBadge('Material', materialLabel))

    card.appendChild(meta)

    const mediaSection = document.createElement('div')
    mediaSection.className = 'item-card__media'

    if (primaryImageUrl) {
      mediaSection.appendChild(
        createImagePreview(
          primaryImageUrl,
          resolvedTitle ? `Abbildung von ${resolvedTitle}` : 'Item-Bild',
          'Item'
        )
      )
    }

    if (loreImageUrl) {
      mediaSection.appendChild(
        createImagePreview(
          loreImageUrl,
          resolvedTitle ? `Lore-Bild zu ${resolvedTitle}` : 'Lore-Bild',
          'Lore'
        )
      )
    }

    if (mediaSection.childElementCount > 0) {
      card.appendChild(mediaSection)
    }

    const loreText = truncateText(resolveItemDescription(item), 360)

    if (loreText) {
      const loreParagraph = document.createElement('p')
      loreParagraph.className = 'item-card__description'
      loreParagraph.textContent = loreText
      card.appendChild(loreParagraph)
    }

    if (!loreText && !loreImageUrl) {
      const fallback = document.createElement('p')
      fallback.className = 'item-card__description item-card__description--muted'
      fallback.textContent = 'Keine zusätzlichen Informationen hinterlegt.'
      card.appendChild(fallback)
    }

    const createdAtDate = resolveItemCreatedAt(item)
    if (createdAtDate) {
      const created = document.createElement('p')
      created.className = 'item-card__footer'
      try {
        const formatted = createdAtDate.toLocaleDateString('de-DE', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
        created.textContent = `Hinzugefügt am ${formatted}`
      } catch (error) {
        console.warn('Konnte Datum nicht formatieren.', error)
        created.textContent = 'Hinzugefügt'
      }
      card.appendChild(created)
    }

    fragments.appendChild(card)
  })

  elements.itemsList.innerHTML = ''
  elements.itemsList.appendChild(fragments)
}

function createMetaBadge(label, value) {
  const badge = document.createElement('span')
  badge.className = 'item-card__meta-badge'

  const term = document.createElement('span')
  term.className = 'item-card__meta-term'
  term.textContent = label

  const val = document.createElement('span')
  val.className = 'item-card__meta-value'
  val.textContent = value

  badge.append(term, val)
  return badge
}

function createImagePreview(url, alt, label) {
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  link.className = 'item-card__preview'
  const previewLabel = label ? `${label} in voller Größe öffnen` : 'Bild in voller Größe öffnen'
  link.setAttribute('aria-label', previewLabel)
  link.title = previewLabel

  const figure = document.createElement('div')
  figure.className = 'item-card__previewFigure'

  const image = document.createElement('img')
  image.src = url
  image.alt = alt
  image.loading = 'lazy'
  image.className = 'item-card__previewImage'
  figure.appendChild(image)

  const overlay = document.createElement('span')
  overlay.className = 'item-card__previewLabel'
  overlay.textContent = label ? `${label} ansehen` : 'Ansehen'

  link.append(figure, overlay)
  return link
}

function populateSelect(select, items, placeholder = 'Alle') {
  if (!select) return
  const previousValue = select.value
  select.innerHTML = ''

  const defaultOption = document.createElement('option')
  defaultOption.value = ''
  defaultOption.textContent = placeholder
  select.appendChild(defaultOption)

  items.forEach((item) => {
    const option = document.createElement('option')
    option.value = String(item.id)
    option.textContent = item.label
    select.appendChild(option)
  })

  if (previousValue) {
    const hasPrevious = items.some((item) => String(item.id) === previousValue)
    if (hasPrevious) {
      select.value = previousValue
    }
  }
}

function handleSelectChange(event, key) {
  const value = event.target.value
  state.filters[key] = value ? Number(value) : null
  loadItems()
}

function handleSearchInput(event) {
  const value = event.target.value?.trim() ?? ''
  window.clearTimeout(searchDebounceId)
  searchDebounceId = window.setTimeout(() => {
    state.filters.search = value ? value : null
    loadItems()
  }, 250)
}

function handleEnchantmentsSearchInput(event) {
  const target = event.target
  if (!(target instanceof HTMLInputElement)) {
    return
  }
  state.enchantmentsSearch = target.value ?? ''
  renderEnchantmentsList()
}

function bindFilterEvents() {
  elements.filterType?.addEventListener('change', (event) => handleSelectChange(event, 'typeId'))
  elements.filterMaterial?.addEventListener('change', (event) => handleSelectChange(event, 'materialId'))
  elements.filterRarity?.addEventListener('change', (event) => handleSelectChange(event, 'rarityId'))
  elements.searchInput?.addEventListener('input', handleSearchInput)
  elements.searchForm?.addEventListener('submit', (event) => {
    event.preventDefault()
    state.filters.search = elements.searchInput?.value?.trim() || null
    loadItems()
  })
}

function bindModalEvents() {
  elements.addItemButton?.addEventListener('click', () => {
    if (!state.user) {
      showToast('Bitte melde dich an, um ein Item hinzuzufügen.', 'warning', {
        action: {
          label: 'Jetzt anmelden',
          onClick: () => handleLogin(),
        },
      })
      return
    }
    openAddItemModal()
  })

  elements.addItemModal?.querySelector('[data-modal-overlay]')?.addEventListener('click', closeAddItemModal)

  elements.addItemModal?.querySelectorAll('[data-modal-close]').forEach((button) => {
    button.addEventListener('click', closeAddItemModal)
  })

  elements.addItemModal?.querySelectorAll('[data-modal-cancel]').forEach((button) => {
    button.addEventListener('click', closeAddItemModal)
  })

  if (elements.enchantmentsSearchInput) {
    elements.enchantmentsSearchInput.addEventListener('input', handleEnchantmentsSearchInput)
    elements.enchantmentsSearchInput.addEventListener('search', handleEnchantmentsSearchInput)
    elements.enchantmentsSearchInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
      }
    })
  }

  if (elements.addItemForm) {
    elements.addItemForm.addEventListener('submit', handleAddItemSubmit)
    elements.addItemForm.addEventListener('reset', handleAddItemFormReset)
    initializeCustomFileInputs()
    initializeStarRatingControl()
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isModalOpen()) {
      closeAddItemModal()
    }
  })
}

function isModalOpen() {
  return elements.addItemModal ? !elements.addItemModal.classList.contains('hidden') : false
}

function openAddItemModal() {
  if (!elements.addItemModal) return
  elements.addItemModal.classList.remove('hidden')
  elements.addItemModal.setAttribute('aria-hidden', 'false')
  window.setTimeout(() => {
    const firstField = elements.addItemForm?.querySelector('input, select, textarea')
    if (firstField instanceof HTMLElement) {
      firstField.focus()
    }
  }, 20)
}

function closeAddItemModal() {
  if (!elements.addItemModal) return
  elements.addItemModal.classList.add('hidden')
  elements.addItemModal.setAttribute('aria-hidden', 'true')
  resetAddItemForm()
}

function resetAddItemForm() {
  elements.addItemForm?.reset()
  clearFormErrors()
  toggleSubmitLoading(false)
  elements.formError?.classList.add('hidden')
  if (elements.formError) {
    elements.formError.textContent = ''
  }
  state.selectedEnchantments.clear()
  state.enchantmentsSearch = ''
  if (elements.enchantmentsSearchInput) {
    elements.enchantmentsSearchInput.value = ''
  }
  renderEnchantmentsList()
  resetCustomFileInputs()
  resetStarRatingControl()
}

function toggleSubmitLoading(isLoading) {
  if (elements.submitButton) {
    elements.submitButton.disabled = Boolean(isLoading)
    elements.submitButton.classList.toggle('opacity-75', Boolean(isLoading))
  }
  elements.submitSpinner?.classList.toggle('hidden', !isLoading)
}

function normalizeFileValue(value) {
  if (typeof File !== 'undefined' && value instanceof File) {
    return value.size > 0 ? value : null
  }
  if (!value || typeof value !== 'object') {
    return null
  }
  const size = Number(value.size)
  const name = typeof value.name === 'string' ? value.name.trim() : ''
  if (!Number.isFinite(size) || size <= 0 || !name) {
    return null
  }
  return value
}

function getFileExtension(name) {
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

function hasAllowedImageExtension(extension) {
  return ALLOWED_IMAGE_EXTENSIONS.includes(extension)
}

function inferImageExtension(file) {
  if (!file) {
    return ''
  }
  const fromName = getFileExtension(file.name)
  if (hasAllowedImageExtension(fromName)) {
    return fromName
  }
  const mimeType = typeof file.type === 'string' ? file.type.toLowerCase() : ''
  if (mimeType && IMAGE_MIME_EXTENSION_MAP[mimeType]) {
    return IMAGE_MIME_EXTENSION_MAP[mimeType]
  }
  return ''
}

function inferMimeTypeFromExtension(extension) {
  switch (extension) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'application/octet-stream'
  }
}

function isAllowedImageFile(file) {
  return Boolean(inferImageExtension(file))
}

function sanitizeStorageSegment(value, fallback) {
  if (typeof value !== 'string') {
    return fallback
  }
  const normalized = value.toLowerCase().replace(/[^a-z0-9-_]/g, '')
  return normalized || fallback
}

function createUniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function buildStoragePath(userId, variant, extension) {
  const safeUserId = sanitizeStorageSegment(userId ?? '', 'anonymous')
  const safeVariant = sanitizeStorageSegment(variant ?? '', 'asset')
  const unique = createUniqueId()
  const variantPrefix = safeVariant ? `${safeVariant}-` : ''
  return `${STORAGE_UPLOAD_ROOT}/${safeUserId}/${variantPrefix}${unique}${extension}`
}

async function uploadImageFile(file, variant, userId) {
  if (!supabase) {
    throw new Error('Supabase ist nicht konfiguriert.')
  }
  const extension = inferImageExtension(file)
  if (!extension || !hasAllowedImageExtension(extension)) {
    throw new Error('Ungültiges Dateiformat.')
  }
  const path = buildStoragePath(userId, variant, extension)
  const contentType = typeof file.type === 'string' && file.type.trim() ? file.type : inferMimeTypeFromExtension(extension)
  const { error } = await supabase.storage
    .from(STORAGE_BUCKET_ITEM_MEDIA)
    .upload(path, file, { cacheControl: '3600', upsert: false, contentType })
  if (error) {
    throw error
  }
  const publicUrlResult = supabase.storage.from(STORAGE_BUCKET_ITEM_MEDIA).getPublicUrl(path)
  if (publicUrlResult?.error) {
    console.warn('Konnte öffentliche URL nicht ermitteln.', publicUrlResult.error)
  }
  const publicUrl = publicUrlResult?.data?.publicUrl ?? null
  return { path, publicUrl }
}

function resolvePrimaryImageUrl(item) {
  if (!item || typeof item !== 'object') {
    return null
  }
  const candidates = [item.item_image, item.image_url, item.imageUrl, item.image]
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

function resolveLoreImageUrl(item) {
  if (!item || typeof item !== 'object') {
    return null
  }
  const candidates = [
    item.item_lore_image,
    item.lore_image_url,
    item.loreImageUrl,
    item.lore_image,
    item.loreImage,
  ]
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

function resolveTextValue(item, keys) {
  if (!item || typeof item !== 'object') {
    return null
  }
  for (const key of keys) {
    if (typeof key !== 'string' || !key) {
      continue
    }
    const value = item[key]
    if (typeof value !== 'string') {
      continue
    }
    const trimmed = value.trim()
    if (trimmed) {
      return trimmed
    }
  }
  return null
}

function resolveItemTitle(item) {
  return resolveTextValue(item, ['title', 'name'])
}

function resolveItemDescription(item) {
  return resolveTextValue(item, ['lore', 'description'])
}

function resolveItemCreatedAt(item) {
  if (!item || typeof item !== 'object') {
    return null
  }
  const candidates = [item.created_at, item.createdAt]
  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    if (candidate instanceof Date && !Number.isNaN(candidate.valueOf())) {
      return candidate
    }
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (!trimmed) {
        continue
      }
      const parsed = new Date(trimmed)
      if (!Number.isNaN(parsed.valueOf())) {
        return parsed
      }
    }
    if (typeof candidate === 'number' && Number.isFinite(candidate)) {
      const parsed = new Date(candidate)
      if (!Number.isNaN(parsed.valueOf())) {
        return parsed
      }
    }
  }
  return null
}

function clearFormErrors() {
  elements.addItemForm?.querySelectorAll('[data-error-for]').forEach((element) => {
    element.classList.add('hidden')
    element.textContent = ''
  })
  setStarRatingErrorState(false)
}

function clearFieldError(field) {
  const target = elements.addItemForm?.querySelector(`[data-error-for="${field}"]`)
  if (target) {
    target.textContent = ''
    target.classList.add('hidden')
  }
  if (field === 'stars') {
    setStarRatingErrorState(false)
  }
}

function showFieldError(field, message) {
  const target = elements.addItemForm?.querySelector(`[data-error-for="${field}"]`)
  if (!target) return
  target.textContent = message
  target.classList.remove('hidden')
  if (field === 'stars') {
    setStarRatingErrorState(true)
  }
}

function updateCustomFileInput(entry) {
  if (!entry || !(entry.input instanceof HTMLInputElement) || !(entry.display instanceof HTMLElement)) {
    return
  }

  const files = entry.input.files
  const file = files && files.length ? files[0] : null
  const hasFile = Boolean(file)
  const fallback = entry.defaultText || 'Keine Datei ausgewählt'
  const sizeText = file ? formatFileSize(file.size) : ''
  const text = hasFile ? [file.name, sizeText].filter(Boolean).join(' · ') : fallback

  entry.display.textContent = text
  entry.display.title = text
  entry.display.dataset.fileHasValue = hasFile ? 'true' : 'false'
  entry.display.classList.toggle('text-slate-500', !hasFile)
  entry.display.classList.toggle('text-slate-200', hasFile)
  entry.display.classList.toggle('font-medium', hasFile)

  if (entry.resetButton instanceof HTMLElement) {
    entry.resetButton.hidden = !hasFile
  }

  const field = entry.input.name || entry.input.id || ''
  if (field) {
    clearFieldError(field)
  }
}

function registerCustomFileInput(input) {
  if (!(input instanceof HTMLInputElement)) {
    return
  }

  const key = input.dataset.fileInput || input.name || input.id
  if (!key || customFileInputs.has(key)) {
    return
  }

  const display = elements.addItemForm?.querySelector(`[data-file-display="${key}"]`)
  if (!(display instanceof HTMLElement)) {
    return
  }

  const resetButton = elements.addItemForm?.querySelector(`[data-file-reset="${key}"]`)
  const entry = {
    input,
    display,
    resetButton: resetButton instanceof HTMLElement ? resetButton : null,
    defaultText: display.dataset.fileDefault || display.textContent || 'Keine Datei ausgewählt',
    update: null,
  }

  entry.update = () => updateCustomFileInput(entry)

  input.addEventListener('change', entry.update)

  if (entry.resetButton) {
    entry.resetButton.addEventListener('click', (event) => {
      event.preventDefault()
      input.value = ''
      input.dispatchEvent(new Event('change', { bubbles: true }))
      input.focus()
    })
  }

  customFileInputs.set(key, entry)
  entry.update()
}

function initializeCustomFileInputs() {
  if (!elements.addItemForm) {
    return
  }

  const inputs = elements.addItemForm.querySelectorAll('[data-file-input]')
  inputs.forEach((node) => {
    if (node instanceof HTMLInputElement) {
      registerCustomFileInput(node)
    }
  })
}

function resetCustomFileInputs() {
  customFileInputs.forEach((entry) => {
    entry.update?.()
  })
}

function normalizeStarValue(value) {
  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      return null
    }
    return Math.max(0, Math.min(value, MAX_STAR_RATING))
  }

  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (!trimmed) {
      return null
    }
    const numeric = Number(trimmed)
    if (!Number.isInteger(numeric)) {
      return null
    }
    return Math.max(0, Math.min(numeric, MAX_STAR_RATING))
  }

  return null
}

function updateStarRatingDisplay() {
  if (!starRatingControl.initialised) {
    return
  }

  const previewValue =
    typeof starRatingControl.hoverValue === 'number'
      ? starRatingControl.hoverValue
      : starRatingControl.value

  let focusAssigned = false

  starRatingControl.buttons.forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return
    }

    const buttonValue = normalizeStarValue(button.dataset.starValue)
    if (buttonValue === null) {
      button.tabIndex = -1
      button.dataset.starSelected = 'false'
      return
    }

    const icon = button.querySelector('[data-star-icon]')
    const isZero = buttonValue === 0
    const isSelected = starRatingControl.value !== null && buttonValue === starRatingControl.value
    const isPreviewed =
      previewValue !== null && typeof previewValue === 'number' && buttonValue > 0 && buttonValue <= previewValue
    const highlight = isPreviewed || (isSelected && buttonValue > 0 && previewValue === starRatingControl.value)

    if (icon instanceof HTMLElement) {
      icon.textContent = highlight ? '★' : '☆'
    }

    button.setAttribute('aria-checked', isSelected ? 'true' : 'false')
    button.dataset.starSelected = isSelected ? 'true' : 'false'

    if (isZero) {
      button.classList.toggle('border-emerald-400', isSelected)
      button.classList.toggle('text-emerald-200', isSelected)
      button.classList.toggle('bg-emerald-500/10', isSelected)
      button.classList.toggle('text-slate-400', !isSelected)
      button.classList.toggle('border-slate-800/70', !isSelected)
    } else {
      button.classList.toggle('text-amber-300', highlight || isSelected)
      button.classList.toggle('text-slate-600', !(highlight || isSelected))
    }

    if (isSelected && !focusAssigned) {
      button.tabIndex = 0
      focusAssigned = true
    } else {
      button.tabIndex = -1
    }
  })

  if (!focusAssigned && starRatingControl.buttons.length) {
    const fallback =
      starRatingControl.buttons.find((button) => normalizeStarValue(button.dataset.starValue) === 0) ??
      starRatingControl.buttons[0]
    if (fallback instanceof HTMLButtonElement) {
      fallback.tabIndex = 0
    }
  }

  if (starRatingControl.input instanceof HTMLInputElement) {
    const currentValue = starRatingControl.value === null ? '' : String(starRatingControl.value)
    starRatingControl.input.dataset.starRatingValue = currentValue
  }
}

function setStarRatingValue(value) {
  const normalized = normalizeStarValue(value)

  const input =
    starRatingControl.input instanceof HTMLInputElement
      ? starRatingControl.input
      : elements.starRatingInput instanceof HTMLInputElement
        ? elements.starRatingInput
        : null

  if (input) {
    input.value = normalized === null ? '' : String(normalized)
  }

  if (!starRatingControl.initialised) {
    starRatingControl.value = normalized
    return
  }

  starRatingControl.value = normalized
  starRatingControl.hoverValue = null
  updateStarRatingDisplay()
  clearFieldError('stars')
}

function setStarRatingHover(value) {
  if (!starRatingControl.initialised) {
    return
  }

  const normalized = normalizeStarValue(value)
  starRatingControl.hoverValue = normalized
  updateStarRatingDisplay()
}

function setStarRatingErrorState(hasError) {
  const container =
    starRatingControl.container instanceof HTMLElement
      ? starRatingControl.container
      : elements.starRating instanceof HTMLElement
        ? elements.starRating
        : null

  const input =
    starRatingControl.input instanceof HTMLInputElement
      ? starRatingControl.input
      : elements.starRatingInput instanceof HTMLInputElement
        ? elements.starRatingInput
        : null

  if (container) {
    if (hasError) {
      container.classList.remove('border-slate-800/60')
      container.classList.add('border-rose-500/60', 'ring-rose-500/40')
      container.setAttribute('aria-invalid', 'true')
    } else {
      container.classList.remove('border-rose-500/60', 'ring-rose-500/40')
      container.classList.add('border-slate-800/60')
      container.removeAttribute('aria-invalid')
    }
  }

  if (input) {
    if (hasError) {
      input.setAttribute('aria-invalid', 'true')
    } else {
      input.removeAttribute('aria-invalid')
    }
  }
}

function handleStarRatingKeydown(event) {
  if (!starRatingControl.initialised) {
    return
  }

  const { key } = event
  const actionableKeys = ['ArrowRight', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'Home', 'End', ' ', 'Enter']
  if (!actionableKeys.includes(key)) {
    return
  }

  const activeElement = document.activeElement
  const index = starRatingControl.buttons.findIndex((button) => button === activeElement)
  if (index === -1) {
    return
  }

  if (key === ' ' || key === 'Enter') {
    event.preventDefault()
    const buttonValue = normalizeStarValue(starRatingControl.buttons[index]?.dataset.starValue)
    setStarRatingValue(buttonValue)
    return
  }

  event.preventDefault()

  let nextIndex = index
  if (key === 'ArrowRight' || key === 'ArrowUp') {
    nextIndex = Math.min(starRatingControl.buttons.length - 1, index + 1)
  } else if (key === 'ArrowLeft' || key === 'ArrowDown') {
    nextIndex = Math.max(0, index - 1)
  } else if (key === 'Home') {
    nextIndex = 0
  } else if (key === 'End') {
    nextIndex = starRatingControl.buttons.length - 1
  }

  const nextButton = starRatingControl.buttons[nextIndex]
  if (nextButton instanceof HTMLButtonElement) {
    nextButton.focus()
    const buttonValue = normalizeStarValue(nextButton.dataset.starValue)
    setStarRatingValue(buttonValue)
    if (buttonValue !== null) {
      setStarRatingHover(buttonValue)
    }
  }
}

function initializeStarRatingControl() {
  if (starRatingControl.initialised) {
    return
  }

  const container = elements.starRating
  const input = elements.starRatingInput
  if (!(container instanceof HTMLElement) || !(input instanceof HTMLInputElement)) {
    return
  }

  const buttons = Array.from(container.querySelectorAll('[data-star-value]')).filter(
    (node) => node instanceof HTMLButtonElement,
  )

  if (!buttons.length) {
    return
  }

  starRatingControl.container = container
  starRatingControl.input = input
  starRatingControl.buttons = buttons
  starRatingControl.initialised = true
  starRatingControl.value = normalizeStarValue(input.value)
  if (starRatingControl.value === null) {
    input.value = ''
  }
  starRatingControl.hoverValue = null

  buttons.forEach((button) => {
    const buttonValue = normalizeStarValue(button.dataset.starValue)
    button.dataset.starSelected = 'false'

    button.addEventListener('click', (event) => {
      event.preventDefault()
      setStarRatingValue(buttonValue)
    })

    button.addEventListener('mouseenter', () => {
      if (buttonValue !== null) {
        setStarRatingHover(buttonValue)
      }
    })

    button.addEventListener('mouseleave', () => {
      setStarRatingHover(null)
    })

    button.addEventListener('focus', () => {
      if (buttonValue !== null) {
        setStarRatingHover(buttonValue)
      }
    })

    button.addEventListener('blur', () => {
      setStarRatingHover(null)
    })
  })

  container.addEventListener('mouseleave', () => {
    setStarRatingHover(null)
  })

  container.addEventListener('keydown', handleStarRatingKeydown)

  updateStarRatingDisplay()
  setStarRatingErrorState(false)
}

function resetStarRatingControl() {
  setStarRatingValue(null)
  if (starRatingControl.initialised) {
    starRatingControl.hoverValue = null
    updateStarRatingDisplay()
  }
  setStarRatingErrorState(false)
}

function handleAddItemFormReset() {
  window.setTimeout(() => {
    resetCustomFileInputs()
    resetStarRatingControl()
  }, 0)
}

function showToast(message, type = 'info', options = {}) {
  const container = elements.toastContainer
  if (!container) return

  const toast = document.createElement('div')
  const themeClass =
    type === 'error'
      ? 'border-red-500/50 bg-red-500/10 text-red-100 shadow-red-500/10'
      : type === 'success'
        ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200 shadow-emerald-500/10'
        : type === 'warning'
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-200 shadow-amber-500/10'
          : 'border-slate-700/60 bg-slate-900/80 text-slate-200 shadow-slate-900/30'

  toast.className = `pointer-events-auto rounded-2xl border px-4 py-3 text-sm shadow-lg transition ${themeClass}`

  const content = document.createElement('div')
  content.className = 'flex items-center justify-between gap-3'

  const text = document.createElement('p')
  text.className = 'flex-1'
  text.textContent = message
  content.appendChild(text)

  if (options.action && typeof options.action.onClick === 'function') {
    const actionButton = document.createElement('button')
    actionButton.type = 'button'
    actionButton.className = 'rounded-md border border-current px-3 py-1 text-xs font-semibold uppercase tracking-wide'
    actionButton.textContent = options.action.label ?? 'Aktion'
    actionButton.addEventListener('click', () => {
      options.action.onClick()
      removeToast()
    })
    content.appendChild(actionButton)
  }

  toast.appendChild(content)
  container.appendChild(toast)

  const removeToast = () => {
    toast.classList.add('opacity-0', 'transition')
    window.setTimeout(() => {
      toast.remove()
    }, 200)
  }

  const timeout = window.setTimeout(removeToast, 5000)
  toast.addEventListener('mouseenter', () => window.clearTimeout(timeout))
  toast.addEventListener('mouseleave', () => {
    window.setTimeout(removeToast, 2000)
  })
}

function formatProfileCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value)
  }
  if (typeof value === 'string') {
    return value
  }
  return '0'
}

function getProfileDisplayName() {
  if (!state.user) {
    return 'Profil'
  }

  const profileName =
    typeof state.profile?.username === 'string' ? state.profile.username.trim() : ''
  if (profileName) {
    return profileName
  }

  const metadata =
    state.user.user_metadata && typeof state.user.user_metadata === 'object'
      ? state.user.user_metadata
      : {}
  const fallbackEmail = typeof state.user.email === 'string' ? state.user.email : ''
  const candidates = [
    metadata.user_name,
    metadata.full_name,
    metadata.name,
    metadata.display_name,
    fallbackEmail,
  ]

  for (const candidate of candidates) {
    if (typeof candidate === 'string') {
      const trimmed = candidate.trim()
      if (trimmed) {
        return trimmed
      }
    }
  }

  return 'Profil'
}

function resolveProfileAvatar() {
  if (!state.user) {
    return { url: '', fallback: '?' }
  }

  const profileAvatar =
    typeof state.profile?.avatar_url === 'string' ? state.profile.avatar_url.trim() : ''
  if (profileAvatar) {
    return { url: profileAvatar, fallback: '' }
  }

  const metadata =
    state.user.user_metadata && typeof state.user.user_metadata === 'object'
      ? state.user.user_metadata
      : {}
  const candidates = [metadata.avatar_url, metadata.picture, metadata.image_url, metadata.avatar]

  for (const value of candidates) {
    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (trimmed) {
        return { url: trimmed, fallback: '' }
      }
    }
  }

  const name = getProfileDisplayName()
  const initial = name ? name.charAt(0).toUpperCase() : 'P'
  return { url: '', fallback: initial }
}

function setProfileModalCounts(items, likes) {
  if (profileModalElements.items) {
    profileModalElements.items.textContent = formatProfileCount(items)
  }
  if (profileModalElements.likes) {
    profileModalElements.likes.textContent = formatProfileCount(likes)
  }
}

function setProfileModalLoading(isLoading) {
  if (!profileModalElements.loading) return
  profileModalElements.loading.classList.toggle('hidden', !isLoading)
}

function setProfileModalError(message) {
  const element = profileModalElements.error
  if (!element) return
  if (message) {
    element.textContent = message
    element.classList.remove('hidden')
  } else {
    element.textContent = ''
    element.classList.add('hidden')
  }
}

function updateProfileModalUserInfo() {
  if (!profileModalElements.modal) {
    return
  }

  const hasUser = Boolean(state.user)
  const displayName = hasUser ? getProfileDisplayName() : 'Nicht angemeldet'

  if (profileModalElements.displayName) {
    profileModalElements.displayName.textContent = displayName
  }

  const { url, fallback } = resolveProfileAvatar()
  if (profileModalElements.avatarImage) {
    profileModalElements.avatarImage.src = url || ''
    profileModalElements.avatarImage.alt = url ? `${displayName} Avatar` : ''
    profileModalElements.avatarImage.classList.toggle('hidden', !url)
  }
  if (profileModalElements.avatarFallback) {
    const fallbackValue = fallback || '–'
    profileModalElements.avatarFallback.textContent = url ? '' : fallbackValue
    profileModalElements.avatarFallback.classList.toggle('hidden', Boolean(url))
  }
  if (profileModalElements.avatarFrame) {
    profileModalElements.avatarFrame.classList.toggle('bg-slate-900/80', !url)
  }

  if (!hasUser) {
    setProfileModalCounts('–', '–')
    setProfileModalError('')
    setProfileModalLoading(false)
  } else if (state.profileStats) {
    setProfileModalCounts(state.profileStats.items, state.profileStats.likes)
  }
}

async function tryCountLikes(table, itemIds) {
  if (!supabase || !Array.isArray(itemIds) || itemIds.length === 0) {
    return { count: 0, missing: false, errored: false }
  }
  try {
    const { count, error } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true })
      .in('item_id', itemIds)
    if (error) {
      throw error
    }
    return { count: typeof count === 'number' ? count : 0, missing: false, errored: false }
  } catch (error) {
    const message = typeof error?.message === 'string' ? error.message : ''
    const code = typeof error?.code === 'string' ? error.code : ''
    const tableMissing =
      code === '42P01' ||
      code === 'PGRST302' ||
      /does not exist/i.test(message) ||
      /not exist/i.test(message)
    if (tableMissing) {
      console.warn(`[profile] Tabelle "${table}" wurde nicht gefunden.`, error)
      return { count: 0, missing: true, errored: false }
    }
    console.warn(`[profile] Fehler beim Abrufen der Likes aus "${table}".`, error)
    return { count: 0, missing: false, errored: true }
  }
}

async function fetchProfileStats() {
  if (!supabase || !state.user?.id) {
    setProfileModalError('Supabase-Client nicht verfügbar.')
    return { items: 0, likes: 0 }
  }

  let itemsCount = 0
  let likesCount = 0
  let hadError = false
  let itemIds = []

  try {
    const { count, error } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('owner', state.user.id)
    if (error) {
      throw error
    }
    itemsCount = typeof count === 'number' ? count : 0
  } catch (error) {
    console.warn('[profile] Konnte Anzahl der Items nicht ermitteln.', error)
    hadError = true
  }

  if (itemsCount > 0) {
    try {
      const { data, error } = await supabase
        .from('items')
        .select('id')
        .eq('owner', state.user.id)
      if (error) {
        throw error
      }
      itemIds = Array.isArray(data)
        ? data.map((row) => row?.id).filter((id) => id !== null && id !== undefined)
        : []
    } catch (error) {
      console.warn('[profile] Konnte Item-IDs nicht laden.', error)
      hadError = true
      itemIds = []
    }
  }

  if (itemIds.length > 0) {
    const primary = await tryCountLikes('item_likes', itemIds)
    if (primary.missing) {
      const fallback = await tryCountLikes('likes', itemIds)
      likesCount = fallback.count
      if (!fallback.missing && fallback.errored) {
        hadError = true
      }
    } else {
      likesCount = primary.count
      if (primary.errored) {
        hadError = true
      }
    }
  }

  setProfileModalError(hadError ? 'Daten konnten nicht vollständig geladen werden.' : '')

  return { items: itemsCount, likes: likesCount }
}

function handleProfileModalKeydown(event) {
  if (event.key === 'Escape' || event.key === 'Esc') {
    event.preventDefault()
    closeProfileModal()
  }
}

function closeProfileModal() {
  if (!profileModalElements.modal || !profileModalState.isOpen) {
    return
  }

  profileModalState.isOpen = false
  profileModalState.activeFetchToken += 1
  profileModalElements.modal.classList.add('hidden')
  profileModalElements.modal.setAttribute('aria-hidden', 'true')
  setProfileModalLoading(false)

  document.removeEventListener('keydown', handleProfileModalKeydown, true)

  const focusTarget = profileModalState.lastFocusedElement
  profileModalState.lastFocusedElement = null
  if (focusTarget instanceof HTMLElement) {
    try {
      focusTarget.focus({ preventScroll: true })
    } catch (error) {
      focusTarget.focus()
    }
  }
}

function openProfileModal() {
  if (!profileModalElements.modal) {
    showToast('Profilbereich ist derzeit nicht verfügbar.', 'info')
    return
  }

  if (!state.user) {
    showToast('Bitte melde dich an, um dein Profil zu sehen.', 'info')
    return
  }

  profileModalState.lastFocusedElement =
    document.activeElement instanceof HTMLElement ? document.activeElement : null

  profileModalElements.modal.classList.remove('hidden')
  profileModalElements.modal.setAttribute('aria-hidden', 'false')
  profileModalState.isOpen = true

  updateProfileModalUserInfo()

  if (state.profileStats) {
    setProfileModalCounts(state.profileStats.items, state.profileStats.likes)
  } else {
    setProfileModalCounts('–', '–')
  }

  setProfileModalError('')
  setProfileModalLoading(true)

  const fetchToken = ++profileModalState.activeFetchToken

  fetchProfileStats()
    .then((result) => {
      if (fetchToken !== profileModalState.activeFetchToken) {
        return
      }
      state.profileStats = result
      setProfileModalCounts(result.items, result.likes)
      updateProfileModalUserInfo()
    })
    .catch((error) => {
      console.error('[profile] Fehler beim Laden der Statistiken.', error)
      if (fetchToken !== profileModalState.activeFetchToken) {
        return
      }
      setProfileModalError('Statistiken konnten nicht geladen werden.')
    })
    .finally(() => {
      if (fetchToken === profileModalState.activeFetchToken) {
        setProfileModalLoading(false)
      }
    })

  document.addEventListener('keydown', handleProfileModalKeydown, true)

  const closeTarget = profileModalElements.closeButtons[0]
  if (closeTarget instanceof HTMLElement) {
    try {
      closeTarget.focus({ preventScroll: true })
    } catch (error) {
      closeTarget.focus()
    }
  }
}

if (profileModalElements.overlay) {
  profileModalElements.overlay.addEventListener('click', (event) => {
    event.preventDefault()
    closeProfileModal()
  })
}

if (profileModalElements.modal) {
  profileModalElements.modal.addEventListener('click', (event) => {
    if (event.target === profileModalElements.modal) {
      closeProfileModal()
    }
  })
}

profileModalElements.closeButtons.forEach((button) => {
  if (button instanceof HTMLElement) {
    button.addEventListener('click', (event) => {
      event.preventDefault()
      closeProfileModal()
    })
  }
})

if (typeof window !== 'undefined') {
  window.ProfileModal = {
    open: openProfileModal,
    close: closeProfileModal,
  }
}

function toggleAuthMenu(show) {
  const trigger = state.authMenu.trigger
  const menu = state.authMenu.menu
  if (!trigger || !menu) return
  const shouldShow = Boolean(show)
  trigger.setAttribute('aria-expanded', String(shouldShow))
  menu.hidden = !shouldShow
}

function closeAuthMenu() {
  toggleAuthMenu(false)
}

function handleDocumentClick(event) {
  const trigger = state.authMenu.trigger
  const menu = state.authMenu.menu
  if (!trigger || !menu) return
  if (trigger.contains(event.target) || menu.contains(event.target)) {
    return
  }
  closeAuthMenu()
}

document.addEventListener('click', handleDocumentClick)

function normaliseRole(value) {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim().toLowerCase()
}

function getModerationFocusableElements(container) {
  if (!(container instanceof HTMLElement)) {
    return []
  }

  const selectors = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ]

  return Array.from(container.querySelectorAll(selectors.join(','))).filter((element) => {
    if (!(element instanceof HTMLElement)) {
      return false
    }

    if (element.hasAttribute('disabled')) {
      return false
    }

    if (element.getAttribute('aria-hidden') === 'true') {
      return false
    }

    if (element.hidden || element.closest('[hidden]')) {
      return false
    }

    if (element.closest('[aria-hidden="true"]')) {
      return false
    }

    return true
  })
}

function focusModerationElement(element) {
  if (!(element instanceof HTMLElement)) {
    return
  }

  try {
    element.focus({ preventScroll: true })
  } catch (error) {
    element.focus()
  }
}

function handleModerationKeydown(event) {
  if (!moderationIsOpen || !(moderationElements.modal instanceof HTMLElement)) {
    return
  }

  if (event.key === 'Escape' || event.key === 'Esc') {
    event.preventDefault()
    closeModerationModal()
    return
  }

  if (event.key !== 'Tab') {
    return
  }

  const focusable = getModerationFocusableElements(moderationElements.modal)

  if (focusable.length === 0) {
    event.preventDefault()
    focusModerationElement(moderationElements.modal)
    return
  }

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement instanceof HTMLElement ? document.activeElement : null

  if (event.shiftKey) {
    if (!active || active === first || !moderationElements.modal.contains(active)) {
      event.preventDefault()
      focusModerationElement(last)
    }
  } else if (!active || active === last || !moderationElements.modal.contains(active)) {
    event.preventDefault()
    focusModerationElement(first)
  }
}

function openModerationModal(trigger) {
  if (!(moderationElements.modal instanceof HTMLElement)) {
    window.location.href = '/moderation'
    return
  }

  moderationLastTrigger = trigger instanceof HTMLElement ? trigger : null

  if (moderationIsOpen) {
    return
  }

  moderationIsOpen = true
  moderationElements.modal.classList.remove('hidden')
  moderationElements.modal.setAttribute('aria-hidden', 'false')

  const [firstFocusable] = getModerationFocusableElements(moderationElements.modal)
  if (firstFocusable) {
    focusModerationElement(firstFocusable)
  } else {
    focusModerationElement(moderationElements.modal)
  }

  document.addEventListener('keydown', handleModerationKeydown, true)
}

function closeModerationModal() {
  if (!(moderationElements.modal instanceof HTMLElement)) {
    return
  }

  if (!moderationIsOpen) {
    return
  }

  moderationIsOpen = false
  moderationElements.modal.classList.add('hidden')
  moderationElements.modal.setAttribute('aria-hidden', 'true')
  document.removeEventListener('keydown', handleModerationKeydown, true)

  if (moderationLastTrigger) {
    focusModerationElement(moderationLastTrigger)
  }

  moderationLastTrigger = null
}

if (moderationElements.overlay instanceof HTMLElement) {
  moderationElements.overlay.addEventListener('click', (event) => {
    if (event.target === moderationElements.overlay) {
      closeModerationModal()
    }
  })
}

moderationElements.closeButtons.forEach((button) => {
  if (button instanceof HTMLElement) {
    button.addEventListener('click', (event) => {
      event.preventDefault()
      closeModerationModal()
    })
  }
})

if (typeof window !== 'undefined') {
  window.ModerationModal = {
    open: openModerationModal,
    close: closeModerationModal,
  }
}

function showModerationLink(menu, role) {
  if (!(menu instanceof HTMLElement)) {
    return null
  }

  const normalizedRole = normaliseRole(role)
  const existing = menu.querySelector('[data-menu-item="moderation"]')

  if (!MODERATION_ROLES.has(normalizedRole)) {
    if (existing instanceof HTMLElement) {
      existing.remove()
    }
    return null
  }

  if (existing instanceof HTMLButtonElement) {
    return existing
  }

  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.menuItem = 'moderation'
  button.className =
    'block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-900/80 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60'
  button.textContent = 'Moderation'
  button.addEventListener('click', (event) => {
    event.preventDefault()
    closeAuthMenu()
    openModerationModal(button)
  })

  const logoutButton = menu.querySelector('[data-menu-item="logout"]')
  if (logoutButton instanceof HTMLElement) {
    menu.insertBefore(button, logoutButton)
  } else {
    menu.appendChild(button)
  }

  return button
}

function renderAuthState() {
  const container = elements.profileContainer
  if (!container) return
  container.innerHTML = ''

  if (!state.user) {
    state.profileStats = null
    state.profileRole = null
    updateProfileModalUserInfo()
    closeProfileModal()
    const loginButton = document.createElement('button')
    loginButton.type = 'button'
    loginButton.className = 'inline-flex items-center gap-2 rounded-full border border-emerald-500/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60'
    loginButton.textContent = 'Mit Discord anmelden'
    loginButton.addEventListener('click', handleLogin)
    container.appendChild(loginButton)
    state.authMenu = { trigger: null, menu: null }
    return
  }

  updateProfileModalUserInfo()

  const wrapper = document.createElement('div')
  wrapper.className = 'relative'

  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'inline-flex items-center gap-3 rounded-full border border-slate-800/70 bg-slate-900/70 px-3 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500/60 hover:text-emerald-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60'
  trigger.setAttribute('aria-haspopup', 'true')
  trigger.setAttribute('aria-expanded', 'false')

  const avatar = document.createElement('span')
  avatar.className = 'flex h-9 w-9 items-center justify-center overflow-hidden rounded-full bg-slate-900 text-sm font-semibold text-emerald-300 ring-1 ring-slate-800'
  const avatarUrl = state.profile?.avatar_url || state.user?.user_metadata?.avatar_url || null
  const username =
    state.profile?.username || state.user?.user_metadata?.full_name || state.user?.user_metadata?.user_name || 'Angemeldet'

  if (avatarUrl) {
    const img = document.createElement('img')
    img.src = avatarUrl
    img.alt = ''
    img.className = 'h-full w-full object-cover'
    avatar.appendChild(img)
  } else {
    avatar.textContent = username?.slice(0, 1)?.toUpperCase() ?? 'U'
  }

  const name = document.createElement('span')
  name.textContent = username

  const caret = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  caret.setAttribute('viewBox', '0 0 24 24')
  caret.setAttribute('aria-hidden', 'true')
  caret.classList.add('h-4', 'w-4', 'text-slate-500')
  const caretPath = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  caretPath.setAttribute('d', 'M6 9l6 6 6-6')
  caretPath.setAttribute('fill', 'none')
  caretPath.setAttribute('stroke', 'currentColor')
  caretPath.setAttribute('stroke-width', '1.5')
  caretPath.setAttribute('stroke-linecap', 'round')
  caretPath.setAttribute('stroke-linejoin', 'round')
  caret.appendChild(caretPath)

  trigger.append(avatar, name, caret)

  const menu = document.createElement('div')
  menu.className = 'absolute right-0 top-full mt-2 min-w-[12rem] rounded-2xl border border-slate-800/80 bg-slate-950 p-2 shadow-lg shadow-emerald-500/10'
  menu.hidden = true

  const profileButton = document.createElement('button')
  profileButton.type = 'button'
  profileButton.dataset.menuItem = 'profile'
  profileButton.className = 'block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-900/80 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60'
  profileButton.textContent = 'Profil'
  profileButton.addEventListener('click', () => {
    closeAuthMenu()
    openProfileModal()
  })

  const logoutButton = document.createElement('button')
  logoutButton.type = 'button'
  logoutButton.dataset.menuItem = 'logout'
  logoutButton.className = 'block w-full rounded-xl px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-rose-500/10 focus:outline-none focus-visible:ring focus-visible:ring-rose-500/40'
  logoutButton.textContent = 'Abmelden'
  logoutButton.addEventListener('click', () => {
    closeAuthMenu()
    handleLogout()
  })

  menu.append(profileButton, logoutButton)
  const role = state.profileRole ?? state.profile?.role ?? null
  showModerationLink(menu, role)
  wrapper.append(trigger, menu)
  container.appendChild(wrapper)

  trigger.addEventListener('click', (event) => {
    event.stopPropagation()
    const expanded = trigger.getAttribute('aria-expanded') === 'true'
    toggleAuthMenu(!expanded)
  })

  state.authMenu = {
    trigger,
    menu,
  }
}

async function handleLogin() {
  if (!supabase) return
  try {
    await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: {
        redirectTo: window.location.href,
      },
    })
  } catch (error) {
    console.error(error)
    showToast('Anmeldung fehlgeschlagen. Bitte versuche es erneut.', 'error')
  }
}

async function handleLogout() {
  if (!supabase) return
  try {
    await supabase.auth.signOut()
    showToast('Erfolgreich abgemeldet.', 'success')
  } catch (error) {
    console.error(error)
    showToast('Abmelden ist fehlgeschlagen.', 'error')
  }
}

async function loadProfile() {
  if (!supabase || !state.user?.id) {
    state.profile = null
    state.profileRole = null
    updateProfileModalUserInfo()
    return
  }
  const resolveMetadataFallback = () => {
    const metadata =
      state.user?.user_metadata && typeof state.user.user_metadata === 'object'
        ? state.user.user_metadata
        : {}
    const emailFallback =
      typeof state.user?.email === 'string' && state.user.email.trim().length > 0
        ? state.user.email.trim()
        : null
    const usernameFallback =
      resolveTextValue(metadata, [
        'full_name',
        'fullName',
        'name',
        'user_name',
        'userName',
        'preferred_username',
        'preferredUsername',
      ]) || emailFallback
    const avatarFallback = resolveTextValue(metadata, [
      'avatar_url',
      'avatarUrl',
      'picture',
      'image_url',
      'imageUrl',
      'avatar',
      'profile_image_url',
      'profileImageUrl',
    ])
    const roleFallback = resolveTextValue(metadata, [
      'role',
      'user_role',
      'userRole',
      'profile_role',
      'profileRole',
      'role_name',
      'roleName',
      'role_slug',
      'roleSlug',
      'role_key',
      'roleKey',
      'role_label',
      'roleLabel',
      'role_id',
      'roleId',
    ])
    return {
      username: usernameFallback ?? null,
      avatar_url: avatarFallback ?? null,
      role: roleFallback ?? null,
    }
  }
  const metadataFallback = resolveMetadataFallback()
  const metadataFallbackRoleNormalized =
    typeof metadataFallback.role === 'string' ? normaliseRole(metadataFallback.role) : ''
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('username,avatar_url,bio,roles:role_id(slug,label)')
      .eq('id', state.user.id)
      .maybeSingle()

    if (error) {
      throw error
    }

    if (data) {
      const usernameFromDb =
        typeof data.username === 'string' ? data.username.trim() : ''
      const avatarFromDb =
        typeof data.avatar_url === 'string' ? data.avatar_url.trim() : ''
      const bioFromDb = typeof data.bio === 'string' ? data.bio.trim() : ''
      const roleFromRelation = resolveTextValue(data.roles, ['slug', 'label'])

      const usernameValue = usernameFromDb || metadataFallback.username || null
      const avatarValue = avatarFromDb || metadataFallback.avatar_url || null
      const bioValue = bioFromDb || null
      const roleValue = roleFromRelation || metadataFallback.role || null

      state.profile = {
        username: usernameValue,
        avatar_url: avatarValue,
        bio: bioValue,
        role: roleValue,
      }

      const normalizedRole =
        typeof roleFromRelation === 'string' ? normaliseRole(roleFromRelation) : ''
      state.profileRole = normalizedRole || metadataFallbackRoleNormalized || null
    } else {
      state.profile = {
        username: metadataFallback.username ?? null,
        avatar_url: metadataFallback.avatar_url ?? null,
        bio: null,
        role: metadataFallback.role ?? null,
      }
      state.profileRole = metadataFallbackRoleNormalized || null
    }
  } catch (error) {
    console.error(error)
    state.profile = {
      username: metadataFallback.username ?? null,
      avatar_url: metadataFallback.avatar_url ?? null,
      bio: null,
      role: metadataFallback.role ?? null,
    }
    state.profileRole = metadataFallbackRoleNormalized || null
  } finally {
    updateProfileModalUserInfo()
  }
}

function renderEnchantmentsList() {
  const container = elements.enchantmentsList
  if (!container) return

  container.innerHTML = ''
  container.style.removeProperty('--enchantments-max-height')

  if (!state.enchantmentsLoaded) {
    container.innerHTML = '<p class="text-sm text-slate-500">Verzauberungen werden geladen…</p>'
    container.scrollTop = 0
    return
  }

  if (state.enchantmentsError) {
    container.innerHTML = '<p class="text-sm text-slate-500">Verzauberungen konnten nicht geladen werden.</p>'
    container.scrollTop = 0
    return
  }

  const rawSearch = typeof state.enchantmentsSearch === 'string' ? state.enchantmentsSearch : ''
  const searchTerm = rawSearch.trim().toLowerCase().replace(/\s+/g, ' ')

  const validIds = new Set()
  state.enchantments.forEach((enchant) => {
    const id = Number(enchant.id)
    if (Number.isFinite(id)) {
      validIds.add(id)
    }
  })
  state.selectedEnchantments.forEach((_level, id) => {
    if (!validIds.has(id)) {
      state.selectedEnchantments.delete(id)
    }
  })

  if (!state.enchantments.length) {
    container.innerHTML = '<p class="text-sm text-slate-500">Keine Verzauberungen verfügbar.</p>'
    container.scrollTop = 0
    return
  }

  const filteredEnchantments = searchTerm
    ? state.enchantments.filter((enchant) => {
        const label = typeof enchant.label === 'string' ? enchant.label.toLowerCase() : ''
        return label.includes(searchTerm)
      })
    : state.enchantments.slice()

  if (!filteredEnchantments.length) {
    container.innerHTML = '<p class="text-sm text-slate-500">Keine Verzauberungen gefunden.</p>'
    container.scrollTop = 0
    return
  }

  const fragment = document.createDocumentFragment()

  filteredEnchantments.forEach((enchant) => {
    const id = Number(enchant.id)
    if (!Number.isFinite(id)) {
      return
    }

    const row = document.createElement('div')
    row.className =
      'flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-950/50 px-3 py-2'
    row.dataset.enchantmentRow = 'true'

    const label = document.createElement('label')
    label.className = 'flex flex-1 items-center gap-3 text-sm text-slate-200'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500'
    checkbox.dataset.enchantmentId = String(enchant.id)

    const name = document.createElement('span')
    name.textContent = typeof enchant.label === 'string' ? enchant.label : ''

    label.append(checkbox, name)

    const levelSelect = document.createElement('select')
    levelSelect.className =
      'rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40'
    levelSelect.dataset.enchantmentLevel = String(enchant.id)

    const maxLevel = Math.max(1, Number(enchant.max_level) || 1)
    levelSelect.dataset.maxLevel = String(maxLevel)

    for (let level = 1; level <= maxLevel; level += 1) {
      const option = document.createElement('option')
      option.value = String(level)
      option.textContent = String(level)
      levelSelect.appendChild(option)
    }

    const savedLevel = state.selectedEnchantments.get(id)
    const hasSavedLevel = Number.isFinite(savedLevel)
    const initialLevel = hasSavedLevel ? Math.min(Math.max(Number(savedLevel), 1), maxLevel) : 1

    levelSelect.value = String(initialLevel)
    levelSelect.disabled = !hasSavedLevel
    checkbox.checked = hasSavedLevel

    if (hasSavedLevel && initialLevel !== savedLevel) {
      state.selectedEnchantments.set(id, initialLevel)
    }

    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        levelSelect.disabled = false
        const level = Math.min(Math.max(Number(levelSelect.value) || 1, 1), maxLevel)
        levelSelect.value = String(level)
        state.selectedEnchantments.set(id, level)
        levelSelect.focus()
      } else {
        levelSelect.disabled = true
        levelSelect.value = '1'
        state.selectedEnchantments.delete(id)
      }
    })

    levelSelect.addEventListener('change', () => {
      const level = Math.min(Math.max(Number(levelSelect.value) || 1, 1), maxLevel)
      levelSelect.value = String(level)
      if (checkbox.checked) {
        state.selectedEnchantments.set(id, level)
      }
    })

    row.append(label, levelSelect)
    fragment.appendChild(row)
  })

  container.appendChild(fragment)
  container.scrollTop = 0
  updateEnchantmentsListMaxHeight()
}

function updateEnchantmentsListMaxHeight() {
  const container = elements.enchantmentsList
  if (!container) return

  const rows = container.querySelectorAll('[data-enchantment-row]')
  if (rows.length <= MAX_VISIBLE_ENCHANTMENTS) {
    container.style.removeProperty('--enchantments-max-height')
    return
  }

  const referenceRow = rows[MAX_VISIBLE_ENCHANTMENTS - 1]
  if (!referenceRow) {
    container.style.removeProperty('--enchantments-max-height')
    return
  }

  const style = window.getComputedStyle(container)
  const paddingBottom = Number.parseFloat(style.paddingBottom) || 0
  const maxHeight = referenceRow.offsetTop + referenceRow.offsetHeight + paddingBottom

  container.style.setProperty('--enchantments-max-height', `${Math.ceil(maxHeight)}px`)
}

function collectSelectedEnchantments() {
  const selections = []
  let validationError = null

  const enchantmentMap = new Map()
  state.enchantments.forEach((enchant) => {
    const id = Number(enchant.id)
    if (Number.isFinite(id)) {
      enchantmentMap.set(id, enchant)
    }
  })

  state.selectedEnchantments.forEach((savedLevel, id) => {
    const enchantment = enchantmentMap.get(id)
    if (!enchantment) {
      state.selectedEnchantments.delete(id)
      return
    }

    const maxLevel = Math.max(1, Number(enchantment.max_level) || 1)
    const level = Number(savedLevel)
    if (!Number.isFinite(level) || level < 1 || level > maxLevel) {
      validationError = `Level muss zwischen 1 und ${maxLevel} liegen.`
      return
    }

    selections.push({ id, level })
  })

  return { selections, error: validationError }
}

function sanitizeInsertPayloadForLog(payload) {
  if (!payload || typeof payload !== 'object') {
    return null
  }

  const allowedKeys = [
    'name',
    'title',
    'item_type_id',
    'material_id',
    'rarity_id',
    'rarity',
    'star_level',
    'stars',
    'item_image',
    'item_lore_image',
    'image_url',
    'lore_image_url',
    'is_published',
  ]

  const result = {}
  allowedKeys.forEach((key) => {
    if (key in payload) {
      result[key] = payload[key]
    }
  })

  if (Array.isArray(payload.enchantments)) {
    result.enchantments = payload.enchantments.map((entry) => ({
      id: entry.id,
      level: entry.level,
    }))
  }

  return result
}

function logInsertAttempt(method, { payload, status, error, response, userId, note } = {}) {
  insertDiagnostics.lastMethod = method ?? null
  insertDiagnostics.lastStatus = typeof status === 'number' ? status : null
  insertDiagnostics.lastPayload = sanitizeInsertPayloadForLog(payload)
  insertDiagnostics.lastError =
    error instanceof Error ? error.message : error ? String(error) : null
  insertDiagnostics.lastResponse = response ?? null
  insertDiagnostics.lastUserId = userId ?? null

  if (typeof console !== 'undefined' && typeof console.info === 'function') {
    const logData = {
      method,
      status: insertDiagnostics.lastStatus,
      userId: insertDiagnostics.lastUserId,
      note: note ?? null,
      payload: insertDiagnostics.lastPayload,
    }
    if (insertDiagnostics.lastError) {
      logData.error = insertDiagnostics.lastError
    }
    console.info('[item-insert]', logData)
  }
}

async function attemptBffInsert({ payload, token, userId }) {
  if (!token) {
    logInsertAttempt('bff', {
      payload,
      userId,
      note: 'missing_token',
      error: 'missing_token',
    })
    return { ok: false, reason: 'missing_token', fatal: true }
  }

  try {
    const response = await fetch(`${API_BASE}/items`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })

    const isJson = response.headers.get('content-type')?.includes('application/json')
    const data = isJson ? await response.json().catch(() => null) : null

    if (response.ok) {
      logInsertAttempt('bff', {
        payload,
        status: response.status,
        response: data,
        userId,
        note: 'success',
      })
      return {
        ok: true,
        status: response.status,
        item: data?.item ?? data ?? null,
        enchantments: data?.enchantments ?? [],
        response: data,
      }
    }

    if (response.status === 401 || response.status === 403) {
      logInsertAttempt('bff', {
        payload,
        status: response.status,
        response: data,
        userId,
        note: 'unauthorized',
      })
      return {
        ok: false,
        reason: 'unauthorized',
        fatal: true,
        status: response.status,
        message: data?.message ?? 'Nicht autorisiert.',
        response: data,
      }
    }

    if (response.status === 400) {
      logInsertAttempt('bff', {
        payload,
        status: response.status,
        response: data,
        userId,
        note: 'validation',
      })
      return {
        ok: false,
        reason: 'validation',
        fatal: true,
        status: response.status,
        message: data?.message ?? 'Validierung fehlgeschlagen.',
        issues: Array.isArray(data?.issues) ? data.issues : null,
        response: data,
      }
    }

    if (response.status === 404 || response.status === 405) {
      logInsertAttempt('bff', {
        payload,
        status: response.status,
        response: data,
        userId,
        note: 'unavailable',
      })
      return { ok: false, reason: 'unavailable', status: response.status, response: data }
    }

    logInsertAttempt('bff', {
      payload,
      status: response.status,
      response: data,
      userId,
      note: 'error',
      error: data?.error ?? data?.message ?? `status_${response.status}`,
    })
    return {
      ok: false,
      reason: 'error',
      status: response.status,
      message: data?.message ?? 'Unbekannter Fehler.',
      response: data,
    }
  } catch (error) {
    logInsertAttempt('bff', { payload, error, userId, note: 'network' })
    return { ok: false, reason: 'network', error }
  }
}

async function attemptDirectInsert({ user, payload, enchantments }) {
  const resolvedStars = Number.isFinite(Number(payload.star_level))
    ? Number(payload.star_level)
    : Number.isFinite(Number(payload.stars))
      ? Number(payload.stars)
      : 0

  const pickUrl = (...candidates) => {
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

  const resolvedItemImage = pickUrl(payload.item_image, payload.image_url)
  const resolvedLoreImage = pickUrl(payload.item_lore_image, payload.lore_image_url)

  const basePayload = {
    title: payload.name ?? payload.title ?? '',
    name: payload.name ?? payload.title ?? '',
    item_type_id: payload.item_type_id,
    material_id: payload.material_id,
    rarity_id: payload.rarity_id ?? null,
    stars: resolvedStars,
    star_level: resolvedStars,
    created_by: user.id,
    item_image: resolvedItemImage,
    item_lore_image: resolvedLoreImage,
    is_published: payload.is_published === true,
  }

  if (payload.rarity !== undefined && payload.rarity !== null) {
    const rarityValue = String(payload.rarity).trim()
    if (rarityValue) {
      basePayload.rarity = rarityValue
    }
  }

  const buildPayloadVariant = (starColumn, useLegacyFallback) => {
    const variant = { ...basePayload }
    delete variant.stars
    delete variant.star_level

    if (starColumn === 'star_level') {
      variant.star_level = resolvedStars
    } else {
      variant.stars = resolvedStars
    }

    if (useLegacyFallback) {
      delete variant.created_by
      delete variant.name
      delete variant.rarity
      variant.owner = user.id
    }

    return variant
  }

  const logPayload = { ...payload, enchantments }

  const executeInsert = async (starColumn, useLegacyFallback) =>
    supabase.from('items').insert([buildPayloadVariant(starColumn, useLegacyFallback)]).select().single()

  const starColumns = ['stars', 'star_level']
  let insertResult = null
  let lastError = null
  let lastStatus = null
  for (const starColumn of starColumns) {
    let result = await executeInsert(starColumn, false)
    if (!result.error && result.data) {
      insertResult = result
      break
    }

    lastError = result.error ?? null
    lastStatus = result.status ?? null

    const message = String(result.error?.message ?? '').toLowerCase()
    const missingStarColumn =
      message.includes('column "stars"') || message.includes('column items.stars')
    const legacyColumnIssue =
      message.includes('column "created_by"') ||
      message.includes('column "name"') ||
      message.includes('column "rarity"') ||
      message.includes("'rarity' column")
    if (legacyColumnIssue) {
      result = await executeInsert(starColumn, true)
      if (!result.error && result.data) {
        insertResult = result
        break
      }
      lastError = result.error ?? null
      lastStatus = result.status ?? null
    }

    if (starColumn === 'stars' && !missingStarColumn) {
      break
    }
  }

  if (!insertResult || insertResult.error || !insertResult.data) {
    logInsertAttempt('supabase', {
      payload: logPayload,
      status: insertResult?.status ?? lastStatus ?? null,
      error: insertResult?.error ?? lastError ?? 'insert_failed',
      userId: user.id,
    })
    throw insertResult?.error || lastError || new Error('Item konnte nicht gespeichert werden.')
  }

  const createdItem = normaliseItemStarFields(insertResult.data)

  if (enchantments.length) {
    const enchantRows = enchantments.map((entry) => ({
      item_id: createdItem.id,
      enchantment_id: entry.enchantment_id ?? entry.id,
      level: entry.level,
    }))
    const { error: enchantError, data: enchantData, status } = await supabase
      .from('item_enchantments')
      .insert(enchantRows)
      .select()

    if (enchantError) {
      logInsertAttempt('supabase', {
        payload: logPayload,
        status: status ?? null,
        error: enchantError,
        userId: user.id,
        note: 'enchant_failed',
      })
      throw enchantError
    }
  }

  logInsertAttempt('supabase', {
    payload: logPayload,
    status: 201,
    userId: user.id,
    note: 'success',
  })

  return { item: createdItem }
}

function showFormLevelError(message) {
  if (!elements.formError) {
    return
  }
  elements.formError.textContent = message ?? ''
  elements.formError.classList.remove('hidden')
}

function handleValidationIssues(issues, fallbackMessage) {
  let derivedMessage =
    typeof fallbackMessage === 'string' && fallbackMessage.trim().length > 0
      ? fallbackMessage.trim()
      : ''

  if (Array.isArray(issues)) {
    issues.forEach((issue) => {
      if (!issue || typeof issue !== 'object') {
        return
      }

      const path = Array.isArray(issue.path) ? issue.path : []
      const field = path.length > 0 ? path[0] : null

      if (typeof field === 'string' && typeof issue.message === 'string' && issue.message.trim()) {
        showFieldError(field, issue.message)
        if (!derivedMessage) {
          derivedMessage = issue.message
        }
      }
    })
  }

  if (!derivedMessage) {
    derivedMessage = 'Validierung fehlgeschlagen.'
  }

  showFormLevelError(derivedMessage)
  showToast(derivedMessage, 'error')
}

async function handleAddItemSubmit(event) {
  event.preventDefault()
  if (!supabase) {
    showToast('Supabase ist nicht konfiguriert.', 'error')
    return
  }

  clearFormErrors()
  elements.formError?.classList.add('hidden')
  if (elements.formError) {
    elements.formError.textContent = ''
  }

  const formData = new FormData(elements.addItemForm)
  const title = (formData.get('title') || '').toString().trim()
  const typeId = formData.get('item_type_id')?.toString() ?? ''
  const materialId = formData.get('material_id')?.toString() ?? ''
  const rarityValue = formData.get('rarity_id') ?? formData.get('rarity')
  const rarityId = rarityValue != null ? rarityValue.toString() : ''
  const starsValue = formData.get('stars')?.toString() ?? ''
  const itemImageFile = normalizeFileValue(formData.get('itemImage'))
  const loreImageFile = normalizeFileValue(formData.get('itemLoreImage'))

  let hasError = false
  if (!title || title.length < 1 || title.length > 120) {
    showFieldError('title', 'Titel muss zwischen 1 und 120 Zeichen lang sein.')
    hasError = true
  }
  if (!typeId) {
    showFieldError('item_type_id', 'Bitte einen Item-Typ auswählen.')
    hasError = true
  }
  if (!materialId) {
    showFieldError('material_id', 'Bitte ein Material auswählen.')
    hasError = true
  }
  if (!rarityId) {
    showFieldError('rarity_id', 'Bitte eine Seltenheit auswählen.')
    hasError = true
  }
  if (!starsValue) {
    showFieldError('stars', `Bitte Sterne auswählen (0 bis ${MAX_STAR_RATING}).`)
    hasError = true
  } else {
    const starsNumber = Number(starsValue)
    if (!Number.isInteger(starsNumber) || starsNumber < 0 || starsNumber > MAX_STAR_RATING) {
      showFieldError('stars', `Sterne müssen zwischen 0 und ${MAX_STAR_RATING} liegen.`)
      hasError = true
    }
  }

  const fileChecks = [
    { file: itemImageFile, field: 'itemImage', label: 'Item-Bild' },
    { file: loreImageFile, field: 'itemLoreImage', label: 'Lore-Bild' },
  ]

  fileChecks.forEach(({ file, field, label }) => {
    if (!file) {
      return
    }
    if (Number(file.size) > MAX_IMAGE_SIZE_BYTES) {
      showFieldError(field, `${label} darf maximal ${MAX_IMAGE_SIZE_MB} MB groß sein.`)
      hasError = true
      return
    }
    if (!isAllowedImageFile(file)) {
      showFieldError(field, `${label} muss ein Bild (PNG, JPG/JPEG, WebP oder GIF) sein.`)
      hasError = true
    }
  })

  if (hasError) {
    return
  }

  const { selections, error: enchantError } = collectSelectedEnchantments()
  if (enchantError) {
    showFieldError('enchantments', enchantError)
    return
  }

  toggleSubmitLoading(true)

  let uploadFailed = false
  const uploadedFilePaths = []
  let createdItem = null
  let itemImageUpload = null
  let loreImageUpload = null

  try {
    const [userResult, sessionResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ])

    if (userResult.error) {
      throw userResult.error
    }
    if (sessionResult.error) {
      throw sessionResult.error
    }

    const user = userResult.data?.user ?? null
    const session = sessionResult.data?.session ?? null
    const accessToken = session?.access_token ?? null

    if (!user || !accessToken) {
      showToast('Bitte anmelden, um Items zu speichern.', 'warning')
      return
    }

    if (itemImageFile) {
      try {
        itemImageUpload = await uploadImageFile(itemImageFile, 'item', user.id)
        if (itemImageUpload?.path) {
          uploadedFilePaths.push(itemImageUpload.path)
        }
      } catch (error) {
        uploadFailed = true
        showFieldError('itemImage', 'Upload des Item-Bildes ist fehlgeschlagen.')
        throw error
      }
    }

    if (loreImageFile) {
      try {
        loreImageUpload = await uploadImageFile(loreImageFile, 'item-lore', user.id)
        if (loreImageUpload?.path) {
          uploadedFilePaths.push(loreImageUpload.path)
        }
      } catch (error) {
        uploadFailed = true
        showFieldError('itemLoreImage', 'Upload des Lore-Bildes ist fehlgeschlagen.')
        throw error
      }
    }

    const sanitizedStars = normalizeStarValue(starsValue)
    const normalizedStars = typeof sanitizedStars === 'number' ? sanitizedStars : 0
    const itemImageUrl =
      typeof itemImageUpload?.publicUrl === 'string' ? itemImageUpload.publicUrl.trim() : ''
    const loreImageUrlValue =
      typeof loreImageUpload?.publicUrl === 'string' ? loreImageUpload.publicUrl.trim() : ''

    const basePayload = {
      name: title,
      title,
      item_type_id: Number(typeId),
      material_id: Number(materialId),
      rarity_id: Number(rarityId),
      star_level: normalizedStars,
      stars: normalizedStars,
      is_published: false,
    }

    if (itemImageUrl) {
      basePayload.item_image = itemImageUrl
    }
    if (loreImageUrlValue) {
      basePayload.item_lore_image = loreImageUrlValue
    }

    const enchantmentPayload = selections.map((entry) => ({
      enchantment_id: entry.id,
      level: entry.level,
    }))

    const bffPayload = {
      ...basePayload,
      item_image: basePayload.item_image ?? undefined,
      item_lore_image: basePayload.item_lore_image ?? undefined,
      enchantments: enchantmentPayload,
    }

    const bffResult = await attemptBffInsert({
      payload: bffPayload,
      token: accessToken,
      userId: user.id,
    })

    if (bffResult.ok) {
      createdItem = bffResult.item
      showToast('Erfolgreich gespeichert.', 'success')
      closeAddItemModal()
      await loadItems()
      return
    }

    if (bffResult.reason === 'unauthorized' || bffResult.reason === 'missing_token') {
      showToast('Bitte anmelden, um Items zu speichern.', 'warning')
      return
    }

    if (bffResult.reason === 'validation') {
      handleValidationIssues(bffResult.issues, bffResult.message)
      return
    }

    if (bffResult.reason === 'unavailable' || bffResult.reason === 'network' || bffResult.reason === 'error') {
      showToast('API nicht erreichbar – versuche direkten Speicherweg…', 'info')
    }

    const directResult = await attemptDirectInsert({
      user,
      payload: basePayload,
      enchantments: enchantmentPayload,
    })

    createdItem = directResult.item
    showToast('Erfolgreich gespeichert.', 'success')
    closeAddItemModal()
    await loadItems()
  } catch (error) {
    console.error(error)
    if (!createdItem && uploadedFilePaths.length && supabase) {
      try {
        await supabase.storage.from(STORAGE_BUCKET_ITEM_MEDIA).remove(uploadedFilePaths)
      } catch (cleanupError) {
        console.warn('Aufräumen fehlgeschlagen.', cleanupError)
      }
    }

    if (error?.code === 'PGRST301') {
      showToast('Bitte anmelden, um Items zu speichern.', 'warning')
    } else if (uploadFailed) {
      const message = 'Upload der Bilder ist fehlgeschlagen. Bitte versuche es erneut.'
      showFormLevelError(message)
      showToast(message, 'error')
    } else if (typeof error?.message === 'string' && error.message.trim()) {
      showFormLevelError(error.message)
      showToast('Speichern fehlgeschlagen.', 'error')
    } else {
      showFormLevelError('Item konnte nicht gespeichert werden.')
      showToast('Speichern fehlgeschlagen.', 'error')
    }
  } finally {
    toggleSubmitLoading(false)
  }
}

function registerItemInsertSelfTest() {
  if (typeof window === 'undefined') {
    return
  }

  window.__itemInsertDiagnostics = insertDiagnostics

  window.__itemInsertSelfTest = async function itemInsertSelfTest() {
    const summary = {
      user: null,
      dryRun: null,
      write: null,
      diagnostics: insertDiagnostics,
    }

    if (!supabase) {
      console.warn('[item-selftest] Supabase Client nicht verfügbar.')
      return summary
    }

    const [userResult, sessionResult] = await Promise.all([
      supabase.auth.getUser(),
      supabase.auth.getSession(),
    ])

    if (userResult.error) {
      console.error('[item-selftest] getUser fehlgeschlagen', userResult.error)
      return summary
    }

    summary.user = userResult.data?.user ?? null

    if (sessionResult.error) {
      console.error('[item-selftest] getSession fehlgeschlagen', sessionResult.error)
      return summary
    }

    const token = sessionResult.data?.session?.access_token ?? null

    if (!summary.user || !token) {
      console.warn('[item-selftest] Kein angemeldeter Nutzer oder Token verfügbar.')
      return summary
    }

    const testPayload = {
      name: `SelfTest Item ${Date.now()}`,
      item_type_id: 1,
      material_id: 1,
      rarity_id: 1,
      star_level: 0,
      enchantments: [],
      is_published: false,
    }

    try {
      const response = await fetch(`${API_BASE}/items?dryRun=1`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(testPayload),
      })
      const body = await response.json().catch(() => null)
      summary.dryRun = { status: response.status, body }
      console.info('[item-selftest] Dry-Run', summary.dryRun)
    } catch (error) {
      console.error('[item-selftest] Dry-Run fehlgeschlagen', error)
      summary.dryRun = {
        error: error instanceof Error ? error.message : String(error),
      }
    }

    if (window.__ALLOW_WRITE_TEST === true) {
      try {
        const writePayload = { ...testPayload, name: `${testPayload.name}-write` }
        const response = await fetch(`${API_BASE}/items`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(writePayload),
        })
        const body = await response.json().catch(() => null)
        summary.write = { status: response.status, body }
        console.info('[item-selftest] Write', summary.write)
        const createdId = body?.item?.id ?? null
        if (createdId) {
          try {
            await supabase.from('items').delete().eq('id', createdId)
            console.info('[item-selftest] Testeintrag entfernt.')
          } catch (cleanupError) {
            console.warn('[item-selftest] Entfernen des Testeintrags fehlgeschlagen.', cleanupError)
          }
        }
      } catch (error) {
        console.error('[item-selftest] Schreiben fehlgeschlagen', error)
        summary.write = {
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }

    return summary
  }
}

async function loadFiltersAndLists() {
  if (!supabase) {
    renderItemsError('Supabase ist nicht konfiguriert. Bitte Meta-Daten ergänzen.')
    state.enchantmentsLoaded = true
    state.enchantmentsError = true
    renderEnchantmentsList()
    return
  }
  state.enchantmentsLoaded = false
  state.enchantmentsError = false
  setAriaBusy(true)
  renderSkeleton(6)
  try {
    const [itemTypesResult, materialsResult, raritiesResult, enchantmentsResult] = await Promise.all([
      fetchItemTypesList(),
      fetchMaterialsList(),
      fetchRaritiesList(),
      supabase.from('enchantments').select('id,label,max_level').order('label', { ascending: true }),
    ])

    const errors = [itemTypesResult.error, materialsResult.error, raritiesResult.error, enchantmentsResult.error].filter(Boolean)
    if (errors.length) {
      throw errors[0]
    }

    state.itemTypes = itemTypesResult.data ?? []
    state.materials = materialsResult.data ?? []
    state.rarities = Array.isArray(raritiesResult.data) ? raritiesResult.data : []
    state.enchantments = enchantmentsResult.data ?? []
    state.enchantmentsLoaded = true
    state.enchantmentsError = false

    populateSelect(elements.filterType, state.itemTypes)
    populateSelect(elements.filterMaterial, state.materials)
    populateSelect(elements.filterRarity, state.rarities, 'Alle Seltenheiten')
    populateSelect(document.getElementById('item-type-select'), state.itemTypes, 'Auswählen…')
    populateSelect(document.getElementById('item-material-select'), state.materials, 'Auswählen…')
    populateSelect(document.getElementById('item-rarity-select'), state.rarities, 'Auswählen…')

    renderEnchantmentsList()

    await loadItems()
  } catch (error) {
    console.error(error)
    state.enchantmentsLoaded = true
    state.enchantmentsError = true
    renderEnchantmentsList()
    renderItemsError('Daten konnten nicht geladen werden.')
    showToast('Initiale Daten konnten nicht geladen werden.', 'error')
  } finally {
    setAriaBusy(false)
  }
}

async function loadItems() {
  if (!supabase) {
    renderItemsError('Supabase ist nicht konfiguriert. Bitte Meta-Daten ergänzen.')
    return
  }
  if (state.itemsLoading) {
    state.reloadRequested = true
    return
  }
  state.itemsLoading = true
  state.reloadRequested = false
  setAriaBusy(true)
  renderSkeleton(3)
  try {
    const sanitizedSearch = state.filters.search
      ? state.filters.search.replace(/%/g, '\\%').replace(/_/g, '\\_')
      : ''


    const selectColumns = [
      'id',
      'title',
      'lore',
      'stars',
      'created_at',
      'updated_at',
      'item_type_id',
      'material_id',
      'rarity_id',
      'owner',
      'item_image',
      'item_lore_image',
    ]

    let query = supabase
      .from('items')
      .select(selectColumns.join(','))
      .order('created_at', { ascending: false })

    if (state.filters.typeId) {
      query = query.eq('item_type_id', state.filters.typeId)
    }
    if (state.filters.materialId) {
      query = query.eq('material_id', state.filters.materialId)
    }
    if (state.filters.rarityId) {
      query = query.eq('rarity_id', state.filters.rarityId)
    }
    if (sanitizedSearch) {
      const searchExpression = ['title', 'lore']
        .map((column) => `${column}.ilike.%${sanitizedSearch}%`)
        .join(',')
      query = query.or(searchExpression)
    }

    const itemsResult = await query

    if (itemsResult.error) {
      throw itemsResult.error
    }

    const rawItems = Array.isArray(itemsResult.data) ? itemsResult.data : []
    const enrichedItems = attachItemLookups(rawItems)
    const normalisedItems = enrichedItems.map(normaliseItemStarFields)
    renderItems(normalisedItems)
  } catch (error) {
    console.error(error)
    renderItemsError('Items konnten nicht geladen werden.')
    showToast('Fehler beim Laden der Items.', 'error')
  } finally {
    state.itemsLoading = false
    setAriaBusy(false)
    if (state.reloadRequested) {
      state.reloadRequested = false
      loadItems()
    }
  }
}

async function initialiseAuth() {
  if (!supabase) {
    state.user = null
    state.profile = null
    state.profileRole = null
    state.profileStats = null
    updateProfileModalUserInfo()
    renderAuthState()
    return
  }
  try {
    const { data } = await supabase.auth.getUser()
    state.user = data?.user ?? null
    if (state.user) {
      state.profileStats = null
      state.profileRole = null
      await loadProfile()
    } else {
      state.profile = null
      state.profileRole = null
      state.profileStats = null
      updateProfileModalUserInfo()
    }
  } catch (error) {
    console.error(error)
    state.user = null
    state.profile = null
    state.profileRole = null
    state.profileStats = null
    updateProfileModalUserInfo()
  }

  renderAuthState()

  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    state.user = session?.user ?? null
    if (state.user) {
      state.profileStats = null
      state.profileRole = null
      await loadProfile()
    } else {
      state.profile = null
      state.profileRole = null
      state.profileStats = null
      updateProfileModalUserInfo()
    }
    renderAuthState()
  })

  authSubscription = data?.subscription ?? null
}

function init() {
  initializeMenuControls()
  bindFilterEvents()
  bindModalEvents()
  initialiseAuth()
  loadFiltersAndLists()
}

registerItemInsertSelfTest()

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

window.addEventListener('resize', updateEnchantmentsListMaxHeight)

window.addEventListener('beforeunload', () => {
  authSubscription?.unsubscribe?.()
})

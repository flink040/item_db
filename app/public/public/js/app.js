import { supabase } from './supabaseClient.js'

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
  user: null,
  profile: null,
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
  enchantmentsList: document.getElementById('enchantmentsList'),
  formError: document.getElementById('addItemFormError'),
  submitButton: document.getElementById('addItemSubmit'),
  submitSpinner: document.querySelector('[data-loading-icon]'),
  toastContainer: document.getElementById('toast-container'),
  profileContainer: document.getElementById('profile-container'),
}

let searchDebounceId = 0
let authSubscription = null

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
        <article class="flex h-full flex-col gap-4 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-5 shadow-inner shadow-slate-950/30 animate-pulse">
          <div class="h-5 w-2/3 rounded bg-slate-800/80"></div>
          <div class="h-4 w-1/2 rounded bg-slate-800/70"></div>
          <div class="h-24 rounded-lg bg-slate-900/80"></div>
          <div class="mt-auto h-3 w-24 rounded bg-slate-800/70"></div>
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
  const value = Number.isFinite(starCount) ? Number(starCount) : 0
  const normalized = Math.min(Math.max(value, 0), 5)
  return Array.from({ length: 5 }, (_, index) => (index < normalized ? '★' : '☆')).join('')
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
    card.className = 'flex h-full flex-col gap-4 rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5 shadow-sm shadow-slate-950/40'

    const header = document.createElement('div')
    header.className = 'flex items-start justify-between gap-3'

    const title = document.createElement('h3')
    title.className = 'text-lg font-semibold text-slate-100'
    title.textContent = item?.title ?? 'Unbenanntes Item'
    header.appendChild(title)

    const stars = document.createElement('span')
    stars.className = 'text-sm font-medium text-amber-300'
    stars.setAttribute('aria-label', `${Number(item?.stars ?? 0)} von 5 Sternen`)
    stars.textContent = renderStars(item?.stars ?? 0)
    header.appendChild(stars)

    card.appendChild(header)

    const meta = document.createElement('div')
    meta.className = 'flex flex-wrap gap-2 text-xs text-slate-300'

    const rarityLabel = item?.rarities?.label ?? 'Unbekannt'
    const typeLabel = item?.item_types?.label ?? 'Unbekannt'
    const materialLabel = item?.materials?.label ?? 'Unbekannt'

    meta.appendChild(createMetaBadge('Seltenheit', rarityLabel))
    meta.appendChild(createMetaBadge('Typ', typeLabel))
    meta.appendChild(createMetaBadge('Material', materialLabel))

    card.appendChild(meta)

    const lore = truncateText(item?.lore, 360)
    const loreParagraph = document.createElement('p')
    loreParagraph.className = 'text-sm leading-relaxed text-slate-300'
    loreParagraph.textContent = lore ?? 'Keine Lore hinterlegt.'
    card.appendChild(loreParagraph)

    if (item?.created_at) {
      const created = document.createElement('p')
      created.className = 'text-xs text-slate-500'
      try {
        const formatted = new Date(item.created_at).toLocaleDateString('de-DE', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
        created.textContent = `Hinzugefügt am ${formatted}`
      } catch (error) {
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
  badge.className = 'inline-flex items-center gap-1 rounded-full border border-slate-800/70 bg-slate-950/60 px-3 py-1'

  const term = document.createElement('span')
  term.className = 'text-[11px] uppercase tracking-wide text-slate-500'
  term.textContent = label

  const val = document.createElement('span')
  val.className = 'text-xs font-medium text-slate-200'
  val.textContent = value

  badge.append(term, val)
  return badge
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

  if (elements.addItemForm) {
    elements.addItemForm.addEventListener('submit', handleAddItemSubmit)
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
  if (elements.enchantmentsList) {
    elements.enchantmentsList.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.checked = false
    })
    elements.enchantmentsList.querySelectorAll('select').forEach((select) => {
      select.disabled = true
      select.value = '1'
    })
  }
}

function toggleSubmitLoading(isLoading) {
  if (elements.submitButton) {
    elements.submitButton.disabled = Boolean(isLoading)
    elements.submitButton.classList.toggle('opacity-75', Boolean(isLoading))
  }
  elements.submitSpinner?.classList.toggle('hidden', !isLoading)
}

function clearFormErrors() {
  elements.addItemForm?.querySelectorAll('[data-error-for]').forEach((element) => {
    element.classList.add('hidden')
    element.textContent = ''
  })
}

function showFieldError(field, message) {
  const target = elements.addItemForm?.querySelector(`[data-error-for="${field}"]`)
  if (!target) return
  target.textContent = message
  target.classList.remove('hidden')
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

function renderAuthState() {
  const container = elements.profileContainer
  if (!container) return
  container.innerHTML = ''

  if (!state.user) {
    const loginButton = document.createElement('button')
    loginButton.type = 'button'
    loginButton.className = 'inline-flex items-center gap-2 rounded-full border border-emerald-500/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60'
    loginButton.textContent = 'Mit Discord anmelden'
    loginButton.addEventListener('click', handleLogin)
    container.appendChild(loginButton)
    state.authMenu = { trigger: null, menu: null }
    return
  }

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
  profileButton.className = 'block w-full rounded-xl px-3 py-2 text-left text-sm text-slate-200 transition hover:bg-slate-900/80 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60'
  profileButton.textContent = 'Profil'
  profileButton.addEventListener('click', () => {
    closeAuthMenu()
    showToast('Profilbereich folgt bald.', 'info')
  })

  const logoutButton = document.createElement('button')
  logoutButton.type = 'button'
  logoutButton.className = 'block w-full rounded-xl px-3 py-2 text-left text-sm text-rose-300 transition hover:bg-rose-500/10 focus:outline-none focus-visible:ring focus-visible:ring-rose-500/40'
  logoutButton.textContent = 'Abmelden'
  logoutButton.addEventListener('click', () => {
    closeAuthMenu()
    handleLogout()
  })

  menu.append(profileButton, logoutButton)
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
    return
  }
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('username, avatar_url')
      .eq('id', state.user.id)
      .maybeSingle()

    if (!error && data) {
      state.profile = data
    } else {
      state.profile = {
        username: state.user?.user_metadata?.full_name ?? null,
        avatar_url: state.user?.user_metadata?.avatar_url ?? null,
      }
    }
  } catch (error) {
    console.error(error)
    state.profile = {
      username: state.user?.user_metadata?.full_name ?? null,
      avatar_url: state.user?.user_metadata?.avatar_url ?? null,
    }
  }
}

function renderEnchantmentsList() {
  if (!elements.enchantmentsList) return

  if (!state.enchantments.length) {
    elements.enchantmentsList.innerHTML = '<p class="text-sm text-slate-500">Keine Verzauberungen verfügbar.</p>'
    return
  }

  const fragment = document.createDocumentFragment()
  state.enchantments.forEach((enchant) => {
    const row = document.createElement('div')
    row.className = 'flex items-center justify-between gap-3 rounded-xl border border-slate-800/70 bg-slate-950/50 px-3 py-2'

    const label = document.createElement('label')
    label.className = 'flex flex-1 items-center gap-3 text-sm text-slate-200'

    const checkbox = document.createElement('input')
    checkbox.type = 'checkbox'
    checkbox.className = 'h-4 w-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500'
    checkbox.dataset.enchantmentId = String(enchant.id)

    const name = document.createElement('span')
    name.textContent = enchant.label

    label.append(checkbox, name)

    const levelSelect = document.createElement('select')
    levelSelect.className = 'rounded-lg border border-slate-800 bg-slate-900 px-3 py-1 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40'
    levelSelect.dataset.enchantmentLevel = String(enchant.id)
    levelSelect.dataset.maxLevel = String(enchant.max_level ?? 1)
    levelSelect.disabled = true

    const maxLevel = Math.max(1, Number(enchant.max_level) || 1)
    for (let level = 1; level <= maxLevel; level += 1) {
      const option = document.createElement('option')
      option.value = String(level)
      option.textContent = String(level)
      levelSelect.appendChild(option)
    }
    levelSelect.value = '1'

    checkbox.addEventListener('change', () => {
      levelSelect.disabled = !checkbox.checked
      if (checkbox.checked) {
        levelSelect.focus()
      }
    })

    row.append(label, levelSelect)
    fragment.appendChild(row)
  })

  elements.enchantmentsList.innerHTML = ''
  elements.enchantmentsList.appendChild(fragment)
}

function collectSelectedEnchantments() {
  if (!elements.enchantmentsList) {
    return { selections: [], error: null }
  }

  const selections = []
  let validationError = null

  const checkboxes = elements.enchantmentsList.querySelectorAll('input[type="checkbox"][data-enchantment-id]:checked')
  checkboxes.forEach((checkbox) => {
    const enchantmentId = Number(checkbox.dataset.enchantmentId)
    if (!Number.isFinite(enchantmentId)) {
      return
    }
    const levelSelect = elements.enchantmentsList.querySelector(
      `select[data-enchantment-level="${checkbox.dataset.enchantmentId}"]`
    )
    if (!levelSelect) {
      return
    }
    const maxLevel = Number(levelSelect.dataset.maxLevel || '1')
    const level = Number(levelSelect.value)
    if (!Number.isFinite(level) || level < 1 || level > maxLevel) {
      validationError = `Level muss zwischen 1 und ${maxLevel} liegen.`
      return
    }
    selections.push({ id: enchantmentId, level })
  })

  return { selections, error: validationError }
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
  const typeId = formData.get('itemType')?.toString() ?? ''
  const materialId = formData.get('material')?.toString() ?? ''
  const rarityId = formData.get('rarity')?.toString() ?? ''
  const starsValue = formData.get('stars')?.toString() ?? ''
  const lore = (formData.get('lore') || '').toString().trim() || null

  let hasError = false
  if (!title || title.length < 1 || title.length > 120) {
    showFieldError('title', 'Titel muss zwischen 1 und 120 Zeichen lang sein.')
    hasError = true
  }
  if (!typeId) {
    showFieldError('itemType', 'Bitte einen Item-Typ auswählen.')
    hasError = true
  }
  if (!materialId) {
    showFieldError('material', 'Bitte ein Material auswählen.')
    hasError = true
  }
  if (!rarityId) {
    showFieldError('rarity', 'Bitte eine Seltenheit auswählen.')
    hasError = true
  }
  if (!starsValue) {
    showFieldError('stars', 'Bitte Sterne auswählen (0 bis 5).')
    hasError = true
  } else {
    const starsNumber = Number(starsValue)
    if (!Number.isInteger(starsNumber) || starsNumber < 0 || starsNumber > 5) {
      showFieldError('stars', 'Sterne müssen zwischen 0 und 5 liegen.')
      hasError = true
    }
  }

  if (hasError) {
    return
  }

  const { selections, error: enchantError } = collectSelectedEnchantments()
  if (enchantError) {
    showFieldError('enchantments', enchantError)
    return
  }

  toggleSubmitLoading(true)

  try {
    const { data: userData, error: userError } = await supabase.auth.getUser()
    if (userError) throw userError
    const user = userData?.user ?? null
    if (!user) {
      showToast('Bitte anmelden, um Items zu speichern.', 'warning')
      toggleSubmitLoading(false)
      return
    }

    const payload = {
      title,
      lore,
      owner: user.id,
      item_type_id: Number(typeId),
      material_id: Number(materialId),
      rarity_id: Number(rarityId),
      stars: Number(starsValue),
    }

    const { data: item, error: insertError } = await supabase
      .from('items')
      .insert([payload])
      .select()
      .single()

    if (insertError) {
      throw insertError
    }

    if (selections.length) {
      const enchantRows = selections.map((entry) => ({
        item_id: item.id,
        enchantment_id: entry.id,
        level: entry.level,
      }))
      const { error: enchantInsertError } = await supabase.from('item_enchantments').insert(enchantRows)
      if (enchantInsertError) {
        throw enchantInsertError
      }
    }

    showToast('Erfolgreich gespeichert.', 'success')
    closeAddItemModal()
    await loadItems()
  } catch (error) {
    console.error(error)
    if (error?.code === 'PGRST301') {
      showToast('Bitte anmelden, um Items zu speichern.', 'warning')
    } else {
      const message =
        typeof error?.message === 'string'
          ? error.message
          : 'Item konnte nicht gespeichert werden.'
      if (elements.formError) {
        elements.formError.textContent = message
        elements.formError.classList.remove('hidden')
      }
      showToast('Speichern fehlgeschlagen.', 'error')
    }
  } finally {
    toggleSubmitLoading(false)
  }
}

async function loadFiltersAndLists() {
  if (!supabase) {
    renderItemsError('Supabase ist nicht konfiguriert. Bitte Meta-Daten ergänzen.')
    return
  }
  setAriaBusy(true)
  renderSkeleton(6)
  try {
    const [itemTypesResult, materialsResult, raritiesResult, enchantmentsResult] = await Promise.all([
      supabase.from('item_types').select('id,label').order('label', { ascending: true }),
      supabase.from('materials').select('id,label').order('label', { ascending: true }),
      supabase
        .from('rarities')
        .select('id,label,sort')
        .order('sort', { ascending: true })
        .order('label', { ascending: true }),
      supabase.from('enchantments').select('id,label,max_level').order('label', { ascending: true }),
    ])

    const errors = [itemTypesResult.error, materialsResult.error, raritiesResult.error, enchantmentsResult.error].filter(Boolean)
    if (errors.length) {
      throw errors[0]
    }

    state.itemTypes = itemTypesResult.data ?? []
    state.materials = materialsResult.data ?? []
    state.rarities = raritiesResult.data ?? []
    state.enchantments = enchantmentsResult.data ?? []

    populateSelect(elements.filterType, state.itemTypes)
    populateSelect(elements.filterMaterial, state.materials)
    populateSelect(elements.filterRarity, state.rarities)
    populateSelect(document.getElementById('itemTypeSelect'), state.itemTypes, 'Auswählen…')
    populateSelect(document.getElementById('itemMaterialSelect'), state.materials, 'Auswählen…')
    populateSelect(document.getElementById('itemRaritySelect'), state.rarities, 'Auswählen…')

    renderEnchantmentsList()

    await loadItems()
  } catch (error) {
    console.error(error)
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
    let query = supabase
      .from('items')
      .select(
        `id,title,lore,stars,created_at,
        item_types:item_type_id(id,label),
        materials:material_id(id,label),
        rarities:rarity_id(id,label,sort)`
      )
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
    if (state.filters.search) {
      const sanitized = state.filters.search.replace(/%/g, '\\%').replace(/_/g, '\\_')
      query = query.or(`title.ilike.%${sanitized}%,lore.ilike.%${sanitized}%`)
    }

    const { data, error } = await query
    if (error) {
      throw error
    }

    renderItems(data ?? [])
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
    renderAuthState()
    return
  }
  try {
    const { data } = await supabase.auth.getUser()
    state.user = data?.user ?? null
    if (state.user) {
      await loadProfile()
    }
  } catch (error) {
    console.error(error)
    state.user = null
  }

  renderAuthState()

  const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
    state.user = session?.user ?? null
    if (state.user) {
      await loadProfile()
    } else {
      state.profile = null
    }
    renderAuthState()
  })

  authSubscription = data?.subscription ?? null
}

function init() {
  bindFilterEvents()
  bindModalEvents()
  initialiseAuth()
  loadFiltersAndLists()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

window.addEventListener('beforeunload', () => {
  authSubscription?.unsubscribe?.()
})

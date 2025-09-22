import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent
} from 'react'
import type { SVGProps } from 'react'

import logoUrl from './logo.svg'

type Item = {
  id: string
  slug: string
  name: string
  rarity?: string | null
  type?: string | null
  material?: string | null
  star_level?: number | null
  description?: string | null
  image_url?: string | null
}

type Enchantment = {
  id: number
  label: string
  slug: string | null
  description: string | null
  maxLevel: number
}

const STAR_LEVEL_VALUES = [0, 1, 2, 3] as const
const MAX_STAR_LEVEL = STAR_LEVEL_VALUES[STAR_LEVEL_VALUES.length - 1]

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

const typeOptions = [
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

const materialOptions = [
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

const rarityOptions = [
  { value: '', label: 'Alle Seltenheiten' },
  { value: 'selten', label: 'Selten' },
  { value: 'episch', label: 'Episch' },
  { value: 'unbezahlbar', label: 'Unbezahlbar' },
  { value: 'legendär', label: 'Legendär' },
  { value: 'jackpot', label: 'Jackpot' },
  { value: 'mega_jackpot', label: 'Mega Jackpot' }
]

const typeLabelMap = typeOptions.reduce<Record<string, string>>((acc, option) => {
  if (option.value) acc[option.value] = option.label
  return acc
}, {})

const materialLabelMap = materialOptions.reduce<Record<string, string>>((acc, option) => {
  if (option.value) acc[option.value] = option.label
  return acc
}, {})

const rarityBadgeClasses: Record<string, string> = {
  selten: 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  episch: 'border border-indigo-500/40 bg-indigo-500/10 text-indigo-300',
  unbezahlbar: 'border border-amber-500/40 bg-amber-500/10 text-amber-200',
  legendär: 'border border-purple-500/40 bg-purple-500/10 text-purple-300',
  jackpot: 'border border-pink-500/40 bg-pink-500/10 text-pink-200',
  mega_jackpot: 'border border-rose-500/40 bg-rose-500/10 text-rose-200'
}

const MAX_RECENT_SEARCHES = 5

type ToastMessage = {
  id: number
  type: 'success' | 'error'
  message: string
}

type ItemFormValues = {
  name: string
  itemType: string
  material: string
  rarity: string
  price: string
  starLevel: string
}

type ItemFormFileValues = {
  itemImage: File | null
  itemLoreImage: File | null
}

const initialItemFormValues: ItemFormValues = {
  name: '',
  itemType: '',
  material: '',
  rarity: '',
  price: '',
  starLevel: '0'
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

function getRarityMeta(value?: string | null) {
  if (!value) {
    return {
      label: 'Unbekannt',
      badgeClass: 'border border-slate-800 bg-slate-900/60 text-slate-300'
    }
  }

  const option = rarityOptions.find((entry) => entry.value === value)

  return {
    label: option?.label ?? value,
    badgeClass:
      rarityBadgeClasses[value] ?? 'border border-slate-800 bg-slate-900/60 text-slate-300'
  }
}

export default function App() {
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

  const abortControllerRef = useRef<AbortController | null>(null)

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

  const fetchItems = useCallback(
    async ({ search, type, material, rarity }: FetchItemsParams) => {
      const sanitizedSearch = sanitizeSearchValue(search)
      const params = new URLSearchParams()

      if (sanitizedSearch.length > 0) {
        params.set('search', sanitizedSearch)
      }

      if (type) {
        params.set('type', type)
      }

      if (material) {
        params.set('material', material)
      }

      if (rarity) {
        params.set('rarity', rarity)
      }

      abortControllerRef.current?.abort()
      const controller = new AbortController()
      abortControllerRef.current = controller

      setLoading(true)
      setError(null)

      const queryString = params.toString()

      try {
        const response = await fetch(`/api/items${queryString ? `?${queryString}` : ''}`, {
          signal: controller.signal
        })

        if (!response.ok) {
          throw new Error('API Fehler')
        }

        const data = await response.json()

        if (!Array.isArray(data)) {
          throw new Error('Unerwartetes API-Format')
        }

        if (abortControllerRef.current === controller) {
          setItems(data as Item[])
          setError(null)
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
    []
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

    return items
      .filter((item) => {
        const matchesSearch =
          normalizedSearch.length === 0 ||
          [item.name, item.slug, item.description ?? ''].some((field) =>
            field?.toLowerCase().includes(normalizedSearch)
          )

        const matchesType = !typeFilter || (item.type ?? '') === typeFilter
        const matchesMaterial = !materialFilter || (item.material ?? '') === materialFilter
        const matchesRarity = !rarityFilter || (item.rarity ?? '') === rarityFilter

        return matchesSearch && matchesType && matchesMaterial && matchesRarity
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'de', { sensitivity: 'base' }))
  }, [items, search, typeFilter, materialFilter, rarityFilter])

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
              className="inline-flex items-center gap-4 rounded-full border border-slate-800/80 bg-slate-900/60 px-7 py-2.5 text-base font-semibold text-slate-200 transition hover:border-emerald-500/70 hover:text-emerald-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500
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
                      {typeOptions.map((option) => (
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
                      {materialOptions.map((option) => (
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
                      {rarityOptions.map((option) => (
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
                      <ItemCard key={item.id} item={item} />
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
            <p className="text-xs text-slate-500">
              Hinweis: Die Anmeldung wird aktuell nicht bereitgestellt – nutze die Supabase Auth Integration in deiner produktiven Instanz.
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
    </div>
  )
}

function ItemModal({ onClose, onSuccess, onError }: ItemModalProps) {
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
  const nameInputRef = useRef<HTMLInputElement | null>(null)
  const enchantmentsAbortControllerRef = useRef<AbortController | null>(null)

  const starLevelValue = Math.max(
    0,
    Math.min(MAX_STAR_LEVEL, Number(formValues.starLevel) || 0)
  )

  useEffect(() => {
    nameInputRef.current?.focus()
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

  const handleStarSelect = (value: number) => {
    updateStarLevel(value)
  }

  const handleStarKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>, value: number) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
      event.preventDefault()
      const previous = starLevelValue <= 0 ? 0 : starLevelValue - 1
      updateStarLevel(previous)
      return
    }

    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
      event.preventDefault()
      const next = starLevelValue >= MAX_STAR_LEVEL ? MAX_STAR_LEVEL : starLevelValue + 1
      updateStarLevel(next)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleStarSelect(value)
    }
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

    const trimmedName = formValues.name.trim()
    const priceValue = formValues.price.trim()
    const nextErrors: ItemFormErrors = {}

    if (!trimmedName) {
      nextErrors.name = 'Name ist erforderlich.'
    }

    if (!formValues.itemType) {
      nextErrors.itemType = 'Item-Typ ist erforderlich.'
    }

    if (!formValues.material) {
      nextErrors.material = 'Material ist erforderlich.'
    }

    if (!formValues.rarity) {
      nextErrors.rarity = 'Seltenheit ist erforderlich.'
    }

    let normalizedPrice: number | null = null
    if (priceValue) {
      const parsedPrice = Number(priceValue.replace(',', '.'))
      if (!Number.isFinite(parsedPrice)) {
        nextErrors.price = 'Preis muss eine gültige Zahl sein.'
      } else if (parsedPrice < 0) {
        nextErrors.price = 'Preis darf nicht negativ sein.'
      } else {
        normalizedPrice = Math.round(parsedPrice * 100) / 100
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

    const { selections, error: enchantmentsValidationError } = collectSelectedEnchantments()
    if (enchantmentsValidationError) {
      setEnchantmentError(enchantmentsValidationError)
      return
    }

    setEnchantmentError(null)
    setSubmitting(true)

    try {
      const formData = new FormData()
      formData.append('name', trimmedName)
      formData.append('itemType', formValues.itemType)
      formData.append('material', formValues.material)
      formData.append('rarity', formValues.rarity)
      formData.append('starLevel', normalizedStarLevel.toString())

      if (priceValue && normalizedPrice !== null) {
        formData.append('price', normalizedPrice.toString())
      }

      if (fileValues.itemImage) {
        formData.append('itemImage', fileValues.itemImage)
      }

      if (fileValues.itemLoreImage) {
        formData.append('itemLoreImage', fileValues.itemLoreImage)
      }

      if (selections.length > 0) {
        formData.append('enchantments', JSON.stringify(selections))
      }

      const response = await fetch('/api/items', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Request failed')
      }

      const result = await response.json().catch(() => null)

      if (!result || result.ok !== true) {
        throw new Error('Invalid response')
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
      onError('Fehler beim Speichern ❌')
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
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block" htmlFor="modal-item-name">
                  <span className="text-sm font-medium text-slate-300">Name *</span>
                  <input
                    id="modal-item-name"
                    name="name"
                    ref={nameInputRef}
                    type="text"
                    required
                    className={getFieldClassName('name')}
                    placeholder="Z. B. OP Netherite Helm"
                    value={formValues.name}
                    onChange={handleFieldChange}
                    aria-invalid={Boolean(errors.name)}
                    aria-describedby={getErrorId('name')}
                  />
                  {errors.name && (
                    <p id="item-modal-name-error" className="mt-2 text-sm text-rose-400">
                      {errors.name}
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
                  >
                    <option value="">Bitte auswählen</option>
                    {typeOptions
                      .filter((option) => option.value)
                      .map((option) => (
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
                  >
                    <option value="">Bitte auswählen</option>
                    {materialOptions
                      .filter((option) => option.value)
                      .map((option) => (
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
                  >
                    <option value="">Bitte auswählen</option>
                    {rarityOptions
                      .filter((option) => option.value)
                      .map((option) => (
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
                    className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-slate-800/60 bg-slate-900/60 px-3 py-2 focus-within:border-emerald-400 focus-within:ring-2 focus-within:ring-emerald-500/40"
                    role="radiogroup"
                    aria-labelledby="modal-item-star-level-label"
                    aria-describedby={errors.starLevel ? 'item-modal-starLevel-error' : undefined}
                  >
                    {STAR_LEVEL_VALUES.map((value) => {
                      const isSelected = starLevelValue === value
                      const isZero = value === 0
                      const starText = '★'.repeat(value).padEnd(MAX_STAR_LEVEL, '☆')
                      const optionClassName = [
                        'inline-flex items-center rounded-md border px-3 py-1 text-xl font-semibold leading-none transition focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60',
                        isSelected
                          ? isZero
                            ? 'border-slate-700 bg-slate-800 text-slate-200'
                            : 'border-amber-400/70 bg-amber-500/10 text-amber-200'
                          : 'border-transparent text-slate-500 hover:border-slate-700 hover:text-amber-200'
                      ].join(' ')

                      return (
                        <button
                          key={value}
                          type="button"
                          onClick={() => handleStarSelect(value)}
                          onKeyDown={(event) => handleStarKeyDown(event, value)}
                          className={optionClassName}
                          role="radio"
                          aria-label={
                            value === 0
                              ? `Kein Stern ausgewählt (0 von ${MAX_STAR_LEVEL} Sternen)`
                              : `${value} von ${MAX_STAR_LEVEL} Sternen`
                          }
                          aria-checked={isSelected}
                        >
                          <span aria-hidden="true" className="font-mono">
                            {starText}
                          </span>
                        </button>
                      )
                    })}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">Optional – wähle bis zu {MAX_STAR_LEVEL} Sterne.</p>
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
                  disabled={submitting}
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
function ItemCard({ item }: { item: Item }) {
  const { label, badgeClass } = getRarityMeta(item.rarity ?? undefined)
  const typeLabel = typeLabelMap[item.type ?? ''] ?? 'Unbekannter Typ'
  const materialLabel = materialLabelMap[item.material ?? ''] ?? 'Unbekanntes Material'
  const starLevel =
    typeof item.star_level === 'number'
      ? Math.max(0, Math.min(MAX_STAR_LEVEL, item.star_level))
      : 0
  const starStates = Array.from({ length: MAX_STAR_LEVEL }, (_, index) => index < starLevel)

  return (
    <article className="relative rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5 shadow-2xl shadow-emerald-500/5">
      <div className="flex flex-col gap-4">
        <div className="flex items-start gap-4">
          <span className="relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-500/10 text-lg font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-500/30">
            {item.image_url ? (
              <img src={item.image_url} alt="" className="h-full w-full object-cover" />
            ) : (
              <span>{item.name.charAt(0)}</span>
            )}
          </span>
          <div className="flex-1 space-y-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">{item.slug}</p>
              <h3 className="text-lg font-semibold text-slate-100">{item.name}</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${badgeClass}`}>
                {label}
              </span>
              {starLevel > 0 && (
                <div className="flex items-center gap-1 text-amber-300">
                  {starStates.map((active, index) => (
                    <span key={index} aria-hidden="true">
                      {active ? '★' : '☆'}
                    </span>
                  ))}
                  <span className="sr-only">{`Stern-Level ${starLevel} von ${MAX_STAR_LEVEL}`}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {item.description && (
          <p className="text-sm leading-relaxed text-slate-400">{item.description}</p>
        )}

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1">
            <BadgeDot className="h-2 w-2 text-emerald-400" />
            {typeLabel}
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1">
            <BadgeDot className="h-2 w-2 text-indigo-400" />
            {materialLabel}
          </span>
        </div>
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

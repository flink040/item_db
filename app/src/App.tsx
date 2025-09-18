import { useEffect, useMemo, useState, type FormEvent } from 'react'
import type { SVGProps } from 'react'

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [materialFilter, setMaterialFilter] = useState('')
  const [rarityFilter, setRarityFilter] = useState('')
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showItemModal, setShowItemModal] = useState(false)
  const [showProfileModal, setShowProfileModal] = useState(false)

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/items')
        if (!res.ok) throw new Error('API Fehler')
        const data = await res.json()
        if (!Array.isArray(data)) {
          throw new Error('Unerwartetes API-Format')
        }
        setItems(data as Item[])
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Fehler beim Laden'
        setError(message)
      } finally {
        setLoading(false)
      }
    }
    run()
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

  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

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

  const normalizedSearchTerm = search.trim()
  const activeFilterCount = [typeFilter, materialFilter, rarityFilter].filter(Boolean).length
  const hasActiveFilters = normalizedSearchTerm.length > 0 || activeFilterCount > 0

  const resultsDescription = loading
    ? 'Ergebnisse werden geladen …'
    : error
      ? 'Beim Laden der Items ist ein Fehler aufgetreten.'
      : items.length === 0
        ? 'Noch keine Items in der Datenbank vorhanden.'
        : hasActiveFilters
          ? `Zeigt ${filteredItems.length} von ${items.length} Items basierend auf deinen Filtern.`
          : `Zeigt ${filteredItems.length} Items aus der Datenbank.`

  const handleSearchSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = search.trim()
    if (!value) return

    setRecentSearches((prev) => {
      const existing = prev.filter((entry) => entry.toLowerCase() !== value.toLowerCase())
      return [value, ...existing].slice(0, MAX_RECENT_SEARCHES)
    })
  }

  const handleRecentSearchSelect = (entry: string) => {
    setSearch(entry)
  }

  return (
    <div className="min-h-full flex flex-col">
      <header className="relative z-50 border-b border-slate-800/80 bg-slate-950/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/20 text-sm font-semibold uppercase tracking-wide text-emerald-300">
              OP
            </span>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">V 0.9</p>
              <p className="text-lg font-semibold text-slate-100">OP ITEM DATENBANK</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="inline-flex items-center gap-3 rounded-full border border-slate-800/80 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-emerald-500/70 hover:text-emerald-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500/10 text-sm font-semibold text-emerald-300 ring-1 ring-inset ring-emerald-500/30">
                U
              </span>
              <span>Profil</span>
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
                    <span className="text-xl font-semibold">OP</span>
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
                <button
                  type="button"
                  onClick={() => setShowItemModal(true)}
                  className="hidden items-center gap-2 rounded-full border border-emerald-500/60 bg-emerald-500/10 px-6 py-2.5 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60 md:inline-flex"
                >
                  <PlusIcon className="h-4 w-4" />
                  Item hinzufügen
                </button>
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

                <div className="grid gap-4 md:grid-cols-3">
                  <label className="block" htmlFor="filter-type">
                    <span className="text-sm font-medium text-slate-300">Item-Typ</span>
                    <select
                      id="filter-type"
                      name="type"
                      className="mt-2 w-full rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                      value={typeFilter}
                      onChange={(event) => setTypeFilter(event.target.value)}
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
                      onChange={(event) => setMaterialFilter(event.target.value)}
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
                      onChange={(event) => setRarityFilter(event.target.value)}
                    >
                      {rarityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-slate-500">Nutze die Filter, um schneller zum passenden Item zu gelangen.</p>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
                  >
                    Suchen
                  </button>
                </div>
              </form>
            </div>
          </div>
        </section>

        <section className="mx-auto w-full max-w-6xl px-6 py-12">
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
                {loading ? (
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
                ) : filteredItems.length === 0 ? (
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

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center p-4 md:hidden">
        <button
          type="button"
          onClick={() => setShowItemModal(true)}
          className="pointer-events-auto inline-flex w-full max-w-md items-center justify-center gap-2 rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-emerald-950 shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
        >
          <PlusIcon className="h-4 w-4" />
          Item hinzufügen
        </button>
      </div>

      {showProfileModal && <ProfileModal onClose={() => setShowProfileModal(false)} />}
      {showItemModal && <ItemModal onClose={() => setShowItemModal(false)} />}
    </div>
  )
}

type ModalProps = {
  onClose: () => void
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
  )
}

function ItemModal({ onClose }: ModalProps) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/80 p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-modal-title"
    >
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-slate-800/80 bg-slate-950 shadow-2xl shadow-emerald-500/10">
        <div className="max-h-[min(66vh,calc(100vh-3rem))] overflow-y-auto p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 id="item-modal-title" className="text-2xl font-semibold text-slate-50">
                Neues Item hinzufügen
              </h2>
              <p className="mt-1 text-sm text-slate-400">
                Trage alle Pflichtfelder ein, um ein Item in die Datenbank aufzunehmen. In dieser Demo werden Daten noch nicht dauerhaft gespeichert.
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

          <form className="mt-6 space-y-6" aria-label="Item hinzufügen" onSubmit={handleSubmit}>
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              Diese Vorschau dient zur Demonstration. Hinterlege deine eigene Logik, um das Formular mit der API zu verbinden.
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block" htmlFor="modal-item-name">
                <span className="text-sm font-medium text-slate-300">Item-Name</span>
                <input
                  id="modal-item-name"
                  name="name"
                  type="text"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="Z. B. OP Netherite Helm"
                />
              </label>

              <label className="block" htmlFor="modal-item-slug">
                <span className="text-sm font-medium text-slate-300">Slug</span>
                <input
                  id="modal-item-slug"
                  name="slug"
                  type="text"
                  required
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="op-netherite-helm"
                />
              </label>

              <label className="block" htmlFor="modal-item-type">
                <span className="text-sm font-medium text-slate-300">Item-Typ</span>
                <select
                  id="modal-item-type"
                  name="type"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-base text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  {typeOptions
                    .filter((option) => option.value)
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block" htmlFor="modal-item-material">
                <span className="text-sm font-medium text-slate-300">Material</span>
                <select
                  id="modal-item-material"
                  name="material"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-base text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  {materialOptions
                    .filter((option) => option.value)
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block" htmlFor="modal-item-rarity">
                <span className="text-sm font-medium text-slate-300">Seltenheit</span>
                <select
                  id="modal-item-rarity"
                  name="rarity"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-base text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  {rarityOptions
                    .filter((option) => option.value)
                    .map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                </select>
              </label>

              <label className="block" htmlFor="modal-item-stars">
                <span className="text-sm font-medium text-slate-300">Stern-Level</span>
                <select
                  id="modal-item-stars"
                  name="star_level"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-base text-slate-100 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                >
                  <option value="0">Kein Stern</option>
                  <option value="1">1 Stern</option>
                  <option value="2">2 Sterne</option>
                  <option value="3">3 Sterne</option>
                </select>
              </label>

              <label className="sm:col-span-2 block" htmlFor="modal-item-image">
                <span className="text-sm font-medium text-slate-300">Bild-URL</span>
                <input
                  id="modal-item-image"
                  name="image_url"
                  type="url"
                  className="mt-1 w-full rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="https://example.com/item.png"
                />
              </label>

              <label className="sm:col-span-2 block" htmlFor="modal-item-description">
                <span className="text-sm font-medium text-slate-300">Beschreibung</span>
                <textarea
                  id="modal-item-description"
                  name="description"
                  rows={4}
                  className="mt-1 w-full resize-none rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-base text-slate-100 placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                  placeholder="Optionaler Beschreibungstext (max. 500 Zeichen)"
                />
              </label>
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
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 transition hover:bg-emerald-400 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60"
              >
                Formular schließen
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

function ItemCard({ item }: { item: Item }) {
  const { label, badgeClass } = getRarityMeta(item.rarity ?? undefined)
  const typeLabel = typeLabelMap[item.type ?? ''] ?? 'Unbekannter Typ'
  const materialLabel = materialLabelMap[item.material ?? ''] ?? 'Unbekanntes Material'
  const starLevel = typeof item.star_level === 'number' ? Math.max(0, Math.min(3, item.star_level)) : 0
  const starStates = Array.from({ length: 3 }, (_, index) => index < starLevel)

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
                  <span className="sr-only">{`Stern-Level ${starLevel} von 3`}</span>
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

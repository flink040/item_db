import { useEffect, useState } from 'react'

type Item = {
  id: string
  slug: string
  name: string
  rarity?: 'common' | 'rare' | 'epic' | 'legendary'
}

export default function App() {
  const [items, setItems] = useState<Item[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/items')
        if (!res.ok) throw new Error('API error')
        const data = await res.json()
        setItems(data)
      } catch (e:any) {
        setError(e.message || 'Fehler beim Laden')
      } finally {
        setLoading(false)
      }
    }
    run()
  }, [])

  return (
    <div className="min-h-dvh">
      <header className="p-6 border-b border-white/10">
        <h1 className="text-2xl font-semibold">OP Item DB</h1>
        <p className="text-white/60">Vite + Cloudflare Pages + Worker BFF</p>
      </header>

      <main className="p-6 max-w-5xl mx-auto">
        {loading && <div>Lade Items…</div>}
        {error && <div className="text-red-400">Fehler: {error}</div>}
        {!loading && !error && (
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {items.map((it) => (
              <li key={it.id} className="rounded-2xl p-4 bg-white/5 backdrop-blur border border-white/10">
                <div className="text-sm uppercase opacity-70">{it.slug}</div>
                <div className="text-xl font-medium">{it.name}</div>
                <div className="opacity-70">{it.rarity ?? '—'}</div>
              </li>
            ))}
          </ul>
        )}
      </main>
      <footer className="p-6 text-center text-white/50 text-sm">Powered by Cloudflare & Supabase</footer>
    </div>
  )
}

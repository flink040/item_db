# OP-Item-DB Starter (Cloudflare Pages + Worker BFF + Supabase)

Dieses Starter-Repo spiegelt die Architektur **v3** wider:
- **Frontend:** Cloudflare Pages (React + Vite + Tailwind)
- **API/BFF:** Cloudflare Worker (`/api/*`) mit Hono + Zod
- **DB:** Supabase (Postgres + RLS), Auth via Discord (Supabase Auth)

## Struktur
```
op-item-db-starter/
├─ app/            # Frontend (Vite React SPA)
└─ worker/         # Cloudflare Worker (BFF) – /api/*
```

## Schnellstart

### 1) Frontend lokal
```bash
cd app
npm i
npm run dev
```

### 2) Worker lokal (Miniflare über Wrangler)
```bash
cd worker
npm i
npx wrangler dev --remote
```

> Für lokale Tests brauchst du Supabase-Keys (siehe `.env.example`).

### 3) Cloudflare Pages
- Neues Pages-Projekt → Repo verbinden → Ordner `app/` als Root setzen
- Build Command: `npm run build`
- Output: `dist`
- SPA-Fallback: `_redirects` wird mitgeliefert
- Route `https://<deinprojekt>.pages.dev/api/*` → auf Worker `op-item-db-api` zeigen

### 4) Worker deploy
```bash
cd worker
npx wrangler deploy
```

### 5) Umgebungsvariablen setzen
Im Cloudflare Dashboard oder via Wrangler (secrets):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (nur im Worker, **nicht** im Frontend!)

---

## Hinweise
- RLS/Policies bitte gemäß deiner SQL-Migrationen aktivieren.
- Der Worker nutzt standardmäßig `Bearer <SERVICE_ROLE_KEY>` für schreibende Operationen (POST/PATCH/DELETE).
- Frontend spricht **nur** gegen `/api/*`, niemals direkt an Supabase Keys (Security!).

Viel Erfolg! ✨

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

## Supabase Frontend Setup
- Hinterlege Supabase-URL und Anon-Key in `app/public/env.js`. Die Datei setzt `window.__ENV` und wird früh im HTML eingebunden, sodass sowohl die statischen Assets (`app/public/assets/js/*`) als auch die Vite-App darauf zugreifen können.
- Aktiviere Discord-OAuth in Supabase; nur eingeloggte Nutzer können Items speichern.
- Ohne Login stehen ausschließlich Lesezugriffe (Filter, Suche) zur Verfügung.

### Supabase-Key-Rotation & Deployment
Damit Cloudflare Pages (statisches Frontend) und der Worker dieselben Zugangsdaten verwenden, führe beim Rotieren des Anon-Keys folgende Schritte aus:

1. Generiere im Supabase-Dashboard einen neuen Anon-Key.
2. Aktualisiere `app/public/env.js` mit URL und neuem Key und committe die Änderung.
3. Aktualisiere die Worker-Variablen (`SUPABASE_URL`, `SUPABASE_ANON_KEY` und ggf. `SUPABASE_SERVICE_ROLE_KEY`) via Wrangler-CLI oder Cloudflare-Dashboard.
4. Triggere ein Deployment der Cloudflare-Pages-Instanz (z. B. `npm run build` + Deploy oder `wrangler pages publish ./public`).
5. Deploye den Worker erneut (`npx wrangler deploy`), damit beide Endpunkte synchron laufen.
6. Prüfe anschließend `/auth/self-check` – hier werden `window.__ENV` sowie der Supabase-Client verifiziert.

Viel Erfolg! ✨

## Lokale Entwicklung & Deployment auf Cloudflare Pages (statisch)

Wenn du nur eine statische Variante der Anwendung (reines HTML/CSS/JS ohne Build-Tool) betreiben möchtest, kannst du die Assets direkt im Ordner `app/public` pflegen und ohne Vite-Build arbeiten.

### Lokal entwickeln

1. Stelle sicher, dass du die [Wrangler-CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installiert hast.
2. Wechsle in das Frontend-Verzeichnis und starte eine lokale Vorschau:

   ```bash
   cd app
   npx wrangler pages dev ./public
   ```

   Wrangler dient hier als kleiner Webserver und unterstützt Live-Reload, sobald du statische Dateien änderst.

### Deployment auf Cloudflare Pages

1. Lege im Cloudflare-Dashboard ein neues Pages-Projekt an und verbinde das Repository.
2. Setze "Build command" auf leer und "Build output directory" auf `app/public`, da keine Build-Pipeline benötigt wird.
3. Alternativ kannst du direkt aus dem Terminal deployen:

   ```bash
   cd app
   npx wrangler pages publish ./public --project-name <dein-pages-projekt>
   ```

   Dabei werden die Dateien unverändert hochgeladen und sofort als statische Seite ausgeliefert.

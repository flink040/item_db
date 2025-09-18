# OP-ITEM-DB -- Architektur v3 (Cloudflare + Supabase)

> Leichtgewichtiges Rollenmodell (Profil-Role), Policies & Validierung
> primär im Cloudflare-Worker (BFF), **defensive Minimal-RLS** in der
> DB. Saubere N:M Items↔Enchantments, **Versionierung**, **Audit-Log**,
> **Slugging**, pragmatisches Edge-Caching. Aufbauend auf v2.

------------------------------------------------------------------------

## 1) High-Level Überblick (unverändert + Ergänzungen)

-   **Frontend:** Cloudflare Pages (React/Tailwind/shadcn).\
-   **API/BFF:** Cloudflare Worker `/api/*` (Schema-Validierung,
    Rollenprüfung, Sign-URLs, Caching).\
-   **DB:** Supabase Postgres (RLS on), Tabellen siehe unten.\
-   **Auth:** Supabase Auth (Discord),
    `profiles.role = 'user'|'moderator'|'admin'`.\
-   **Storage:** Supabase Storage `item-media` (Original + Thumbs).\
-   **CI/CD:** GitHub → Pages Previews & Prod; dedizierte
    Supabase-Projekte je Umgebung (statt Schemas).

------------------------------------------------------------------------

## 2) Architekturdiagramm (wie v2, mit Thumbs & Webhooks ergänzt)

``` mermaid
flowchart LR
  subgraph Client
    UI[Web UI (Pages)]
  end

  subgraph Cloudflare
    CF[Pages Hosting]
    WK[Worker BFF /api/*]
    KV[(Edge Cache)]
  end

  subgraph Supabase
    SBDB[(Postgres DB + RLS)]
    SBAuth[(Auth: Discord)]
    SBStor[(Storage: item-media)]
  end

  UI -- HTTPS --> CF
  CF -- fetch /api/* --> WK
  WK -- read/write (JWT/Service Key) --> SBDB
  WK -- signed URLs & webhooks --> SBStor
  WK <---> KV
  UI -- direct GET signed URL --> SBStor
  UI -- Auth flow --> SBAuth
```

(Erweitert aus v2.)

------------------------------------------------------------------------

## 3) Datenmodell (Core + neue Tabellen)

**profiles**\
`id uuid PK → auth.users(id) ON DELETE CASCADE` · `username unique` ·
`avatar_url` · `role enum('user','moderator','admin') default 'user'` ·
`created_at`

**items**\
`id uuid PK` · `slug text unique not null` (generiert aus Name) ·
`name text not null` · `description text` ·
`rarity enum('common','rare','epic','legendary')` ·
`created_by uuid → profiles.id` · `is_published boolean default false` ·
`created_at` · `updated_at`

**enchantments**\
`id serial PK` · `key text unique not null` · `name_de text not null` ·
`max_level int` ·
`slot enum('weapon','tool','armor','book','universal') not null`

**item_enchantments** (Join)\
`item_id uuid → items(id) on delete cascade` ·
`enchantment_id int → enchantments(id) on delete cascade` ·
`level int not null` · `PRIMARY KEY(item_id, enchantment_id)`

**tags** / **item_tags** (optional, wie v2).

**NEU: item_versions**\
Historie pro Item: `id bigserial PK` · `item_id uuid` · `version int` ·
`diff jsonb` (z. B. Patch) · `snapshot jsonb` · `changed_by uuid` ·
`created_at`.\
→ Erlaubt „Rollback" & Nachvollziehbarkeit ohne das Live-Objekt zu
überschreiben.

**NEU: audit_log**\
`id bigserial PK` · `actor uuid` · `action text`
(create\|update\|delete\|publish\|unpublish\|login) · `entity text`
(item\|enchantment\|profile) · `entity_id text` · `meta jsonb` ·
`created_at`.\
→ Für Moderation & Debugging.

------------------------------------------------------------------------

## 4) Auth-Flows (Discord) & Profilanlage

-   Bei erstem Login wird per **DB-Trigger** oder Worker-Hook ein
    `profiles`-Datensatz mit `role='user'` erzeugt.

------------------------------------------------------------------------

## 5) Berechtigungen & Sicherheitsstrategie

### Rollenmodell

-   **Leichtgewichtig**: `profiles.role` steuert Moderationsrechte,
    Business-Logik liegt im Worker (BFF).

### Defensive Minimal-RLS (in der DB)

-   `items SELECT`: `is_published = true` **oder**
    `created_by = auth.uid()` **oder** Rolle ≥ moderator.\
-   `items INSERT`: `auth.uid() = new.created_by`.\
-   `items UPDATE/DELETE`: Owner **oder** Rolle ≥ moderator.\
-   `profiles SELECT/UPDATE`: `id = auth.uid()`.

### Validierung im Worker (BFF)

-   Schema-Checks (z. B. Zod) für Payloads.\
-   Businessregeln: max Enchantment-Level, verbotene Kombinationen,
    Publish-Gate.

### Audit & Versionierung

-   Jede Mutation erzeugt einen **audit_log**-Eintrag; Updates
    persistieren zusätzlich eine **item_versions**-Row (Snapshot/Delta).

------------------------------------------------------------------------

## 6) API-Design (BFF)

**GET** `/api/items?query=&enchantment=&tag=&rarity=&page=&limit=`\
**GET** `/api/items/:slug` (statt `:id` für hübsche URLs)\
**POST** `/api/items` (Owner = `auth.uid`)\
**PATCH/DELETE** `/api/items/:id` (Owner oder Moderator+)\
**GET** `/api/enchantments` (langes Caching)\
**POST** `/api/upload` (signierte URL; MIME/Size-Checks)

**Webhooks (optional)**\
- `POST /api/webhooks/storage/object-created` → Thumb-Queue.

------------------------------------------------------------------------

## 7) Storage, Media & Thumbnails

-   Bucket: `item-media/items/<itemId>/...`\
-   Upload: signierte URL über Worker.\
-   Thumbs (on-upload) via Worker-Image-Route (Edge cached).

------------------------------------------------------------------------

## 8) Frontend (Pages) -- UX-Ergänzungen

-   Views: `ItemsList`, `ItemDetail`, `NewItem`, `Profile`,
    **ModerationQueue** (Unpublished Items), **HistoryView**
    (Versionen).\
-   Komfort: Autocomplete (Enchantments/Tags), „Zuletzt angesehen",
    Favoriten.\
-   Optimierungen wie v2 (Suspense/Streaming, Prefetch, Skeletons).

------------------------------------------------------------------------

## 9) Caching-Strategie (pragmatisch)

-   **Listen/Details:**
    `cache-control: public, max-age=60, stale-while-revalidate=120`.\
-   **Invalidierung:** Mini-Purge nur für die exakt betroffenen Keys
    **oder** kurze TTL + ETags.

------------------------------------------------------------------------

## 10) CI/CD & Umgebungen (gehärtet)

-   **Previews**: Eigene **Supabase-Projekte** pro Env (dev, preview,
    prod) statt Schema-Tricks → weniger Policy-/Key-Risiko.\
-   **Migrationsfluss:** Alle Schema-Änderungen als versionierte
    SQL-Files im Repo; Deployment via GitHub Action vor Pages-Release.

------------------------------------------------------------------------

## 11) Observability & Qualität

-   Worker-Logging: Route, Dauer, Cache-Hit, User-ID
    (hash/anonymisiert), Fehlercodes.\
-   Feature-Flags: Edge-gecachte JSON-Config.\
-   Sentry/Telemetry optional.

------------------------------------------------------------------------

## 12) Import-/Seed-Pipelines

-   **Enchantments Seed** (CSV/SQL) für Vanilla-Liste (deutsch).\
-   **Items Import** (CSV/JSON) mit Mapping (Name, Rarity,
    Enchantments\[\], Media URLs).\
-   Validierung im Worker, Dry-Run-Modus, Report in `audit_log`.

------------------------------------------------------------------------

## 13) Mini-ERD (aktualisiert)

``` mermaid
erDiagram
  profiles ||--o{ items : created_by
  items ||--o{ item_enchantments : contains
  enchantments ||--o{ item_enchantments : applies
  items ||--o{ item_versions : history
  profiles ||--o{ audit_log : actor

  profiles {
    uuid id PK
    text username
    enum role
    text avatar_url
    timestamptz created_at
  }
  items {
    uuid id PK
    text slug UK
    text name
    text description
    enum rarity
    uuid created_by FK
    bool is_published
    timestamptz created_at
    timestamptz updated_at
  }
  enchantments {
    int id PK
    text key UK
    text name_de
    int max_level
    enum slot
  }
  item_enchantments {
    uuid item_id FK
    int enchantment_id FK
    int level
  }
  item_versions {
    bigint id PK
    uuid item_id FK
    int version
    jsonb diff
    jsonb snapshot
    uuid changed_by FK
    timestamptz created_at
  }
  audit_log {
    bigint id PK
    uuid actor FK
    text action
    text entity
    text entity_id
    jsonb meta
    timestamptz created_at
  }
```

------------------------------------------------------------------------

## 14) Beispiel-SQL (Auszug, kompakt)

**ENUMs & Basistabellen**

``` sql
-- Enums
create type rarity_t as enum ('common','rare','epic','legendary');
create type role_t   as enum ('user','moderator','admin');
create type slot_t   as enum ('weapon','tool','armor','book','universal');

-- Profiles
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  avatar_url text,
  role role_t not null default 'user',
  created_at timestamptz default now()
);

-- Items (+ Slug)
create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  rarity rarity_t,
  created_by uuid not null references profiles(id) on delete cascade,
  is_published boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enchantments
create table if not exists enchantments (
  id serial primary key,
  key text unique not null,
  name_de text not null,
  max_level int,
  slot slot_t not null
);

-- Join
create table if not exists item_enchantments (
  item_id uuid not null references items(id) on delete cascade,
  enchantment_id int not null references enchantments(id) on delete cascade,
  level int not null,
  primary key (item_id, enchantment_id)
);

-- Versionen & Audit
create table if not exists item_versions (
  id bigserial primary key,
  item_id uuid not null references items(id) on delete cascade,
  version int not null,
  diff jsonb,
  snapshot jsonb,
  changed_by uuid references profiles(id),
  created_at timestamptz default now()
);

create table if not exists audit_log (
  id bigserial primary key,
  actor uuid references profiles(id),
  action text not null,
  entity text not null,
  entity_id text not null,
  meta jsonb,
  created_at timestamptz default now()
);
```

**Slug-Erzeugung (funktional & Trigger)**

``` sql
create or replace function make_slug(txt text) returns text language sql immutable as $$
  select regexp_replace(lower(trim(txt)), '[^a-z0-9]+', '-', 'g')
$$;

create or replace function items_set_slug()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'INSERT' or new.name is distinct from old.name) then
    new.slug := make_slug(new.name);
  end if;
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists trg_items_set_slug on items;
create trigger trg_items_set_slug before insert or update on items
for each row execute function items_set_slug();
```

**Minimal-RLS (aktivieren & Kern-Policies)**

``` sql
alter table profiles enable row level security;
alter table items enable row level security;

-- Profiles: nur eigenes Profil
create policy profiles_self on profiles
  for select using (id = auth.uid());
create policy profiles_self_update on profiles
  for update using (id = auth.uid());

-- Items: lesen (published ODER Owner ODER Mod+)
create policy items_read on items
  for select using (
    is_published
    or created_by = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('moderator','admin')
    )
  );

-- Items: schreiben
create policy items_insert on items
  for insert with check (created_by = auth.uid());

create policy items_write on items
  for update using (
    created_by = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('moderator','admin')
    )
  );

create policy items_delete on items
  for delete using (
    created_by = auth.uid()
    or exists (
      select 1 from profiles p
      where p.id = auth.uid() and p.role in ('moderator','admin')
    )
  );
```

------------------------------------------------------------------------

## 15) Moderations-Flow (UI)

-   **ModerationQueue:** Liste aller `is_published = false` mit
    Schnellaktionen (Publish/Reject, Diff-Ansicht ggü. letzter
    Version).\
-   **HistoryView:** Anzeige `item_versions` mit Restore-Action (neue
    Version anlegen, nicht „hart" zurückschreiben).

------------------------------------------------------------------------

## 16) Roadmap (inkrementell, präzisiert)

**MVP (Woche 1--2)**\
1) Enums & Basistabellen + Minimal-RLS\
2) Worker: `/api/items` GET/POST (+ Validierung)\
3) UI: List/Detail/Create, Enchantment-Picker\
4) Seed Enchantments (CSV/SQL)

**Phase 2**\
5) Media Upload (signierte URL) + Thumbs/Webhook\
6) ModerationQueue + Publish-Gate\
7) Audit-Log + erste Versionierung

**Phase 3**\
8) Tags & erweiterte Filter\
9) HistoryView + Restore\
10) Discord-Bot (read-only)

------------------------------------------------------------------------

## 17) Caching-Pseudocode (unverändert, mit ETag-Hinweis)

Nutze v2-Snippet und ergänze ETag-Antworten (Hash des JSON), damit
Clients effizient „revalidieren" können.

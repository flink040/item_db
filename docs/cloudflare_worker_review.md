# Cloudflare Worker Review (BFF `/api/*`)

## 1. Architektur & Sauberkeit
- **Meta-Endpunkte nutzen Service-Role-Client:** `fetchMaterialsList`, `fetchItemTypesList` und `fetchRaritiesList` initialisieren für reine Lesezugriffe einen Service-Role-Client. Damit umgehen die Routen `/api/materials`, `/api/item_types` und `/api/rarities` jede RLS-Policy, obwohl laut Architektur-Dokument die Anon-Role verwendet und serverseitig gecacht werden soll.【F:worker/src/routes/meta.ts†L4-L74】【F:worker/src/index.ts†L861-L905】
- **Debug-/Diag-Endpunkte liegen unter `/api`**: `/api/diag` und `/api/debug/echo` sind öffentlich erreichbar, liefern interne Informationen bzw. spiegeln eingehende Requests komplett zurück. Das weicht von der erwarteten REST-Oberfläche (`/api/items`, `/api/enchantments`, `/api/upload`, Webhooks) ab und erhöht das Risiko unbeabsichtigter Exposition.【F:worker/src/index.ts†L770-L846】
- **Edge-Caching unvollständig:** Weder `/api/items` noch die Meta-Endpunkte liefern ETags oder Cache-Invalidierungsmechanismen. Die Items-Route sendet zwar ein kurzes `cache-control`, nutzt aber kein `stale-if-error` bzw. Conditional Requests, wie im Architektur-Dokument gefordert.【F:worker/src/index.ts†L905-L960】【F:worker/src/index.ts†L861-L905】

## 2. Sicherheit
- **Service-Role-Key für öffentliche Listenabfragen:** Durch den Einsatz des Service-Role-Key in `fetch*List`-Routinen kann jede Fehlkonfiguration den Schlüssel nach außen leaken. Für GET-Routen sollte nur der Anon-Key verwendet werden, damit RLS greift.【F:worker/src/routes/meta.ts†L4-L74】
- **`/api/debug/echo` offenbart sensible Header:** Der Endpoint spiegelt alle Request-Header zurück (inkl. `Authorization`/Cookies) und verletzt damit die Vorgabe, keine Tokens auszugeben. Es gibt keine Authentifizierung oder Rate-Limits.【F:worker/src/index.ts†L787-L844】
- **Rollenprüfung fehlt bei Mutationen:** Beim `POST /api/items` wird lediglich geprüft, ob ein User existiert. Es erfolgt keine Kontrolle, ob der Nutzer Owner oder Moderator ist. Damit können beliebige authentifizierte Nutzer Items erstellen und veröffentlichen.【F:worker/src/index.ts†L990-L1117】

## 3. Business-Logik
- **Publish-Gate fehlt:** `normaliseItemPayload` übernimmt `is_published` direkt aus dem Request. Ohne Rollenprüfung können neue Items sofort veröffentlicht werden, entgegen der Vorgabe, dass nur Moderatoren veröffentlichen dürfen.【F:worker/src/index.ts†L372-L413】【F:worker/src/index.ts†L1076-L1089】
- **Keine Versionierung/Audit-Log:** Nach erfolgreichem Insert werden weder `item_versions` befüllt noch ein Audit-Log geschrieben. Der Worker beendet den Flow nach `insertItemWithEnchantments` und gibt die Daten zurück.【F:worker/src/index.ts†L952-L1117】
- **RLS wird umgangen:** Durch Inserts mit dem Service-Role-Client (`insertItemWithEnchantments`) greift keine Policy, wodurch Ownership-Regeln auf Datenbank-Ebene wirkungslos werden.【F:worker/src/index.ts†L516-L643】【F:worker/src/index.ts†L1035-L1089】

## 4. Fehlerbehandlung & DX
- **Fehlende strukturierte Fehlerlogs:** Abgesehen von Meta-Fehlern gibt es kein Logging von Route, Dauer, Cache-Hits oder anonymisierter User-ID. Anforderungen an Observability laut Architektur werden damit nicht erfüllt.【F:worker/src/index.ts†L749-L767】【F:worker/src/index.ts†L1115-L1117】
- **Fehlercodes teilweise grob:** `fetch`-Fehler gegen Supabase liefern nur `{ error: 'supabase_error' }` ohne Details, was das Debugging erschwert. Gleichzeitig verrät `/api/debug/echo` zu viele Informationen für Endnutzer.【F:worker/src/index.ts†L905-L960】【F:worker/src/index.ts†L787-L844】

## 5. Optimierungen
- **Gemeinsame Fetch-Header fehlen:** Auth-Header-Aufbereitung für Supabase wird mehrfach ad-hoc gebaut. Ein dedizierter Helper würde Wiederholungen reduzieren und konsistente Header (inkl. `If-None-Match`) ermöglichen.【F:worker/src/index.ts†L905-L960】
- **Schema deckt `is_published` nicht ab:** Obwohl das Feld in der Business-Logik entscheidend ist, existiert kein Zod-Schema-Eintrag. Eine Validierung über das Schema würde Missbrauch verhindern.【F:worker/src/schemas.ts†L4-L24】【F:worker/src/index.ts†L372-L413】
- **Dead Code prüfen:** Mehrere Legacy-Fallbacks in `insertItemWithEnchantments` (z. B. `stars` vs. `star_level`, `owner` vs. `created_by`) wirken wie Übergangslösungen. Falls alte Spalten nicht mehr benötigt werden, sollten sie entfernt oder migrationsgestützt behandelt werden.【F:worker/src/index.ts†L520-L643】

## Positives
- JSON-Parsing liefert hilfreiche Fehlermeldungen mit Kontext und kooperiert mit nicht-konformen Clients.【F:worker/src/index.ts†L40-L207】
- `validateEnchantments` verhindert Duplikate und Level-Überschreitungen, deckt damit einen Großteil der Enchantment-Business-Regeln ab.【F:worker/src/index.ts†L414-L472】

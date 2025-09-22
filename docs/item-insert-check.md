# Item Insert Check

## Architekturpfad
- Formular `#addItemForm` validiert Pflichtfelder und sammelt Verzauberungslevel aus dem Modal.
- Nach erfolgreicher Validierung lädt der Client optionale Bilder in `item-media` hoch und sammelt die resultierenden Public-URLs.
- Mit gültigem Supabase-Session-Token wird bevorzugt `POST /api/items` (Cloudflare Worker) aufgerufen.
  - Der Worker liest `auth.uid()` aus dem JWT, setzt `created_by` serverseitig, validiert Payload (inkl. Level-Grenzen) und legt `items` + `item_enchantments` an.
  - `?dryRun=1` liefert eine reine Validierung ohne persistente Änderung.
- Ist der Worker nicht verfügbar, greift der Client auf einen direkten Supabase-Insert zurück (`created_by` + optionales Legacy-Fallback auf `owner`).
- Nach Erfolg werden Toast, Formular-Reset und `loadItems()` ausgelöst, sodass das neue Item sofort sichtbar ist.

## Manuelle Testschritte
1. Supabase-Login durchführen (Discord-Auth-Flow). Ohne Login erscheint beim Speichern ein Warn-Toast und der Request wird abgebrochen.
2. Modal „Item hinzufügen" öffnen, Pflichtfelder ausfüllen und optional Verzauberungen aktivieren.
3. Während des Speicherns prüft der Submit-Button den Spinner/Disabled-State (`toggleSubmitLoading`).
4. Netzwerkanalyse: erfolgreiche Pfade zeigen `POST /api/items` (201). Fallback-Fälle erzeugen zusätzlich `from('items').insert(...)` Requests.
5. Nach dem Speichern erscheint ein Erfolgs-Toast; das Item ist in der Liste (auch wenn `is_published=false`).
6. In Supabase prüfen, dass `created_by = auth.uid()` (RLS-konform) gesetzt wurde und Einträge in `item_enchantments` existieren.

## Diagnose & Logging
- Der Client loggt unter `[item-insert]` Methode (`bff` oder `supabase`), User-ID, Statuscode sowie ein sanitisiertes Payload-Snapshot.
- Die letzte Diagnose ist über `window.__itemInsertDiagnostics` abrufbar.
- Fehler der BFF-Validierung werden im Formular (`data-form-error`) und via Toast angezeigt.
- Uploadfehler führen zur Bereinigung der bereits hochgeladenen Dateien.

## Selbsttest
```js
// Nur Lesen (dry run)
window.__itemInsertSelfTest()

// Optional echten Schreibtest (Eintrag wird anschließend versucht zu löschen)
window.__ALLOW_WRITE_TEST = true
window.__itemInsertSelfTest()
```
Der Selbsttest prüft Auth-Status, führt einen `dryRun` gegen `/api/items` aus und protokolliert das Ergebnis in der Konsole. Mit `__ALLOW_WRITE_TEST` wird zusätzlich ein Test-Insert durchgeführt und direkt wieder gelöscht (Best-Effort, abhängig von RLS).

## Typische Fehlerbilder
- **Nicht angemeldet:** Warn-Toast „Bitte anmelden…“ und kein Insert.
- **Validierungsfehler:** Feldbezogene Hinweise per `showFieldError`, Formular-Fehlermeldung mit Worker-Issues.
- **Worker nicht verfügbar:** Info-Toast „API nicht erreichbar – versuche direkten Speicherweg…“ und Fallback auf Supabase-Insert.
- **Upload-Fehler:** Formularhinweis + Toast, bereits hochgeladene Dateien werden via Storage-API entfernt.

## Hinweise
- Der Worker akzeptiert sowohl neue (`name`, `created_by`, `star_level`) als auch Legacy-Felder (`title`, `rarity_id`).
- Fallback-Inserts besitzen ein Legacy-Recovery, falls die Spalte `created_by` noch nicht existiert (weicht auf `owner` aus).
- Die Client-Validierung deckt nur offensichtliche Pflichtfelder ab – serverseitige Regeln (Max-Level, RLS) gelten weiterhin.

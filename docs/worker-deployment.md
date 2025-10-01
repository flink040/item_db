# Cloudflare Worker Deployment Guide

Dieser Leitfaden beschreibt, wie du den API-Worker nach einer Codeänderung neu deployen kannst.

## Voraussetzungen

- Du hast die [Wrangler-CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installiert und bist über `wrangler login` bei Cloudflare authentifiziert.
- Im Projektverzeichnis `worker/` liegt eine gültige `wrangler.toml`-Konfiguration mit dem Namen deines Workers.
- Alle benötigten Secrets (z. B. `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) sind in Cloudflare hinterlegt. Falls nicht, kannst du sie per `npx wrangler secret put <NAME>` setzen.

## Deployment-Schritte

1. **In das Worker-Verzeichnis wechseln**
   ```bash
   cd worker
   ```
2. **Abhängigkeiten installieren (falls noch nicht geschehen)**
   ```bash
   npm install
   ```
3. **Optional: Lokalen Testlauf starten**
   ```bash
   npx wrangler dev --remote
   ```
   So kannst du prüfen, ob der Worker fehlerfrei läuft, bevor du ihn veröffentlichst.
4. **Deployment ausführen**
   ```bash
   npx wrangler deploy
   ```
   Wrangler baut den Worker, lädt ihn zu Cloudflare hoch und ersetzt die aktive Version.
5. **Ergebnis überprüfen**
   - Die URL des Workers findest du nach dem Deploy in der Wrangler-Ausgabe oder im Cloudflare-Dashboard.
   - Kontrolliere die Logs mit `npx wrangler tail`, um sicherzustellen, dass keine Fehler auftreten.

## Rollback

Falls du zur vorherigen Version zurückkehren möchtest, kannst du im Cloudflare-Dashboard unter **Workers & Pages → Workers → Deployments** eine ältere Veröffentlichung aktivieren oder den letzten funktionierenden Commit erneut deployen.

Viel Erfolg beim Deploy! ✨

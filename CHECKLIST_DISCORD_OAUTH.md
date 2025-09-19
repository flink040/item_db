# Discord OAuth Checkliste

Diese Schritte stellen sicher, dass die Discord-Anmeldung über Supabase korrekt funktioniert.

## Discord Developer Portal
1. Öffne das [Discord Developer Portal](https://discord.com/developers/applications) und wähle deine Anwendung aus.
2. Navigiere zu **OAuth2 → General** und trage unter **Redirects** exakt folgende URL ein:
   https://<SUPABASE-PROJECT-REF>.supabase.co/auth/v1/callback
3. Aktiviere in der Anwendung mindestens den Scope `identify`. Optional kannst du zusätzlich `email` aktivieren.

## Supabase
1. Gehe in Supabase zu **Auth → Providers → Discord** und hinterlege die Client ID sowie das Client Secret deiner Discord-Anwendung.
2. Öffne **Auth → URL Configuration** und stelle sicher, dass
   - **Site URL** auf die Produktionsdomain zeigt (z. B. `https://example.com`).
   - Unter **Additional Redirect URLs** alle benötigten Preview- und Staging-Domains eingetragen sind.

## Cloudflare Pages
1. Lege in den Projekteinstellungen unter **Environment Variables** folgende Variablen an und fülle sie sowohl für Preview als auch Production aus:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
2. Veröffentliche das Projekt erneut, damit die neuen Variablen aktiv werden.

Mit dieser Checkliste sind alle relevanten Stellen für den Discord-OAuth-Flow abgedeckt.

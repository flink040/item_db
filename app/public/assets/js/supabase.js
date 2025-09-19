(function () {
  const globalScope =
    typeof window !== 'undefined'
      ? window
      : typeof self !== 'undefined'
        ? self
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;

  if (!globalScope) {
    return;
  }

  if (globalScope.__supabaseClientReady) {
    return;
  }

  const SUPABASE_MODULE_SOURCES = [
    'https://esm.sh/@supabase/supabase-js@2?bundle',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm',
  ];

  async function loadImportMetaEnv() {
    try {
      const module = await import(
        'data:application/javascript,export default (typeof import.meta !== "undefined" && import.meta.env) ? import.meta.env : {}'
      );
      const env = module && typeof module.default === 'object' ? module.default : {};
      return env || {};
    } catch (error) {
      return {};
    }
  }

  async function loadSupabaseCreateClient() {
    if (typeof globalScope.__supabaseCreateClient === 'function') {
      return globalScope.__supabaseCreateClient;
    }

    for (const source of SUPABASE_MODULE_SOURCES) {
      try {
        const module = await import(source);
        if (module && typeof module.createClient === 'function') {
          globalScope.__supabaseCreateClient = module.createClient;
          return module.createClient;
        }
      } catch (error) {
        console.warn('[supabase] Konnte Modul nicht laden:', source, error);
      }
    }

    return null;
  }

  async function initialiseClient() {
    const viteEnv = await loadImportMetaEnv();
    const fallbackEnv = globalScope.__ENV && typeof globalScope.__ENV === 'object' ? globalScope.__ENV : {};

    const supabaseUrl =
      (viteEnv && typeof viteEnv.VITE_SUPABASE_URL === 'string' && viteEnv.VITE_SUPABASE_URL) ||
      (fallbackEnv && typeof fallbackEnv.VITE_SUPABASE_URL === 'string' && fallbackEnv.VITE_SUPABASE_URL) ||
      '';
    const supabaseAnonKey =
      (viteEnv && typeof viteEnv.VITE_SUPABASE_ANON_KEY === 'string' && viteEnv.VITE_SUPABASE_ANON_KEY) ||
      (fallbackEnv && typeof fallbackEnv.VITE_SUPABASE_ANON_KEY === 'string' && fallbackEnv.VITE_SUPABASE_ANON_KEY) ||
      '';

    globalScope.__supabaseEnv = {
      url: supabaseUrl || null,
      anonKey: supabaseAnonKey || null,
      source: viteEnv && Object.keys(viteEnv).length > 0 ? 'import.meta.env' : 'window.__ENV',
    };

    if (!supabaseUrl || !supabaseAnonKey) {
      console.warn('[supabase] Fehlende Supabase-Umgebungsvariablen – URL oder Anon-Key nicht definiert.');
      globalScope.supabase = null;
      return null;
    }

    const createClient = await loadSupabaseCreateClient();
    if (typeof createClient !== 'function') {
      console.error('[supabase] Supabase createClient konnte nicht geladen werden.');
      globalScope.supabase = null;
      return null;
    }

    const client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });

    globalScope.supabase = client;
    return client;
  }

  const readyPromise = initialiseClient().catch((error) => {
    console.error('[supabase] Initialisierung fehlgeschlagen.', error);
    globalScope.supabase = null;
    return null;
  });

  globalScope.__supabaseClientReady = readyPromise;
})();

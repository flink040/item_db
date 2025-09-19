(function () {
  const globalScope =
    typeof window !== 'undefined'
      ? window
      : typeof self !== 'undefined'
        ? self
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;

  const doc = globalScope && globalScope.document ? globalScope.document : null;
  if (!globalScope || !doc) {
    return;
  }

  const baseBadgeClass =
    'status-badge inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold transition-colors duration-150';
  const statusStyles = {
    pending: 'border border-slate-800/60 bg-slate-900/40 text-slate-300',
    success: 'border border-emerald-500/40 bg-emerald-500/15 text-emerald-200',
    fail: 'border border-rose-500/50 bg-rose-500/10 text-rose-300',
    ready: 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  };
  const statusText = {
    pending: 'Ausstehend',
    success: 'OK',
    fail: 'Fehler',
    ready: 'Bereit',
  };

  const checks = new Map();
  doc.querySelectorAll('[data-check]').forEach((element) => {
    const key = element.getAttribute('data-check');
    if (!key) {
      return;
    }
    const badge = element.querySelector('[data-status-badge]');
    const detail = element.querySelector('[data-check-detail]');
    checks.set(key, { element, badge, detail });
  });

  const loginButton = doc.querySelector('[data-oauth-test]');
  const loginPreview = doc.querySelector('[data-login-preview]');
  const loginAvatar = doc.querySelector('[data-login-avatar]');
  const loginFallback = doc.querySelector('[data-login-fallback]');
  const loginName = doc.querySelector('[data-login-name]');
  const loginEmail = doc.querySelector('[data-login-email]');

  function setStatus(key, status, detailMessage) {
    const entry = checks.get(key);
    if (!entry) {
      return;
    }
    if (entry.badge && statusStyles[status]) {
      entry.badge.className = `${baseBadgeClass} ${statusStyles[status]}`;
      entry.badge.textContent = statusText[status] || status;
    }
    if (entry.detail && typeof detailMessage === 'string') {
      entry.detail.textContent = detailMessage;
    }
  }

  function resetPreview() {
    if (loginPreview) {
      loginPreview.classList.add('hidden');
    }
    if (loginAvatar) {
      loginAvatar.classList.add('hidden');
      loginAvatar.src = '';
    }
    if (loginFallback) {
      loginFallback.classList.remove('hidden');
      loginFallback.textContent = '–';
    }
    if (loginName) {
      loginName.textContent = '–';
    }
    if (loginEmail) {
      loginEmail.textContent = '–';
    }
  }

  function getSupabaseProjectUrl(candidate) {
    if (candidate && typeof candidate === 'object') {
      const directUrl =
        (typeof candidate.supabaseUrl === 'string' && candidate.supabaseUrl.trim()) ||
        (typeof candidate.url === 'string' && candidate.url.trim());
      if (directUrl) {
        return directUrl;
      }
    }

    const env = globalScope.__supabaseEnv;
    if (env && typeof env === 'object' && typeof env.url === 'string' && env.url.trim()) {
      return env.url.trim();
    }

    const config = globalScope.APP_CONFIG;
    if (
      config &&
      typeof config === 'object' &&
      typeof config.SUPABASE_URL === 'string' &&
      config.SUPABASE_URL.trim()
    ) {
      return config.SUPABASE_URL.trim();
    }

    return null;
  }

  function buildOAuthRedirectUrl(candidate) {
    if (!globalScope.location) {
      return undefined;
    }

    const { origin, pathname, search } = globalScope.location;
    const normalizedPath = typeof pathname === 'string' && pathname ? pathname : '/';
    const baseTarget = `${origin}${normalizedPath}${search || ''}`;

    const projectUrl = getSupabaseProjectUrl(candidate);
    if (!projectUrl) {
      return baseTarget;
    }

    try {
      const callbackUrl = new URL('/auth/v1/callback', projectUrl);
      callbackUrl.searchParams.set('redirect_to', baseTarget);
      return callbackUrl.toString();
    } catch (error) {
      console.warn('[auth-check] Supabase Callback-URL konnte nicht erstellt werden.', error);
      return baseTarget;
    }
  }

  function displayUser(user) {
    if (!user || typeof user !== 'object') {
      resetPreview();
      return;
    }

    const metadata = (user.user_metadata && typeof user.user_metadata === 'object' && user.user_metadata) || {};
    const name =
      (typeof metadata.user_name === 'string' && metadata.user_name.trim()) ||
      (typeof metadata.full_name === 'string' && metadata.full_name.trim()) ||
      (typeof metadata.name === 'string' && metadata.name.trim()) ||
      (typeof user.email === 'string' && user.email.trim()) ||
      'Discord Nutzer';

    const email =
      (typeof user.email === 'string' && user.email.trim()) ||
      (typeof metadata.email === 'string' && metadata.email.trim()) ||
      '–';

    const avatarUrl =
      (typeof metadata.avatar_url === 'string' && metadata.avatar_url.trim()) ||
      (typeof metadata.picture === 'string' && metadata.picture.trim()) ||
      (typeof metadata.image_url === 'string' && metadata.image_url.trim()) ||
      '';

    if (loginPreview) {
      loginPreview.classList.remove('hidden');
    }
    if (loginName) {
      loginName.textContent = name;
    }
    if (loginEmail) {
      loginEmail.textContent = email;
    }
    if (avatarUrl && loginAvatar) {
      loginAvatar.src = avatarUrl;
      loginAvatar.alt = `${name} Avatar`;
      loginAvatar.classList.remove('hidden');
      if (loginFallback) {
        loginFallback.classList.add('hidden');
      }
    } else {
      if (loginAvatar) {
        loginAvatar.classList.add('hidden');
        loginAvatar.src = '';
      }
      if (loginFallback) {
        loginFallback.classList.remove('hidden');
        loginFallback.textContent = name.charAt(0).toUpperCase();
      }
    }
  }

  function setLoginButtonEnabled(enabled, message) {
    if (!loginButton) {
      return;
    }
    loginButton.disabled = !enabled;
    if (enabled) {
      loginButton.classList.remove('cursor-not-allowed', 'opacity-60');
      loginButton.removeAttribute('aria-disabled');
    } else {
      loginButton.classList.add('cursor-not-allowed', 'opacity-60');
      loginButton.setAttribute('aria-disabled', 'true');
    }
    if (typeof message === 'string') {
      setStatus('oauth', enabled ? 'ready' : 'fail', message);
    }
  }

  async function resolveSupabase() {
    if (globalScope.supabase) {
      return globalScope.supabase;
    }
    if (globalScope.__supabaseClientReady) {
      try {
        const client = await globalScope.__supabaseClientReady;
        if (client) {
          return client;
        }
      } catch (error) {
        console.error('[auth-check] Supabase-Initialisierung fehlgeschlagen.', error);
      }
    }
    return globalScope.supabase || null;
  }

  async function exchangeCodeIfPresent(supabase) {
    if (!supabase || !globalScope.location) {
      return { handled: false, success: false };
    }
    try {
      const currentUrl = new URL(globalScope.location.href);
      const hasCode = currentUrl.searchParams.has('code');
      const hasState = currentUrl.searchParams.has('state');
      if (hasCode && hasState) {
        setStatus('result', 'pending', 'Verarbeite Rückkehr von Discord…');
        await supabase.auth.exchangeCodeForSession(globalScope.location.href);
        currentUrl.searchParams.delete('code');
        currentUrl.searchParams.delete('state');
        const newUrl = currentUrl.pathname + currentUrl.hash;
        globalScope.history.replaceState({}, '', newUrl);
        return { handled: true, success: true };
      }
    } catch (error) {
      console.error('[auth-check] exchangeCodeForSession fehlgeschlagen.', error);
      setStatus('result', 'fail', 'Fehler beim Austausch des Tokens. Details siehe Konsole.');
      return { handled: true, success: false };
    }
    return { handled: false, success: false };
  }

  async function fetchSession(supabase) {
    if (!supabase) {
      setStatus('session', 'fail', 'Supabase-Client fehlt.');
      resetPreview();
      return null;
    }
    try {
      const { data, error } = await supabase.auth.getSession();
      if (error) {
        throw error;
      }
      const session = data?.session || null;
      if (session?.user) {
        setStatus('session', 'success', 'Aktive Session gefunden.');
        setStatus('result', 'success', 'Login OK.');
        displayUser(session.user);
      } else {
        setStatus('session', 'success', 'Keine aktive Session.');
        setStatus('result', 'pending', 'Kein Login durchgeführt.');
        resetPreview();
      }
      return session;
    } catch (error) {
      console.error('[auth-check] getSession fehlgeschlagen.', error);
      setStatus('session', 'fail', 'Session konnte nicht geladen werden.');
      setStatus('result', 'fail', 'Session-Abfrage fehlgeschlagen.');
      resetPreview();
      return null;
    }
  }

  function bindLoginButton(supabase) {
    if (!loginButton) {
      return;
    }
    setLoginButtonEnabled(true);
    loginButton.addEventListener('click', async () => {
      if (!supabase) {
        setStatus('oauth', 'fail', 'Supabase-Client nicht verfügbar.');
        return;
      }
      try {
        setStatus('oauth', 'success', 'Weiterleitung zu Discord gestartet.');
        setStatus('result', 'pending', 'Warte auf Rückkehr von Discord…');
        const redirectTo = buildOAuthRedirectUrl(supabase);
        const oauthOptions = {
          scopes: 'identify email',
        };
        if (typeof redirectTo === 'string' && redirectTo.length > 0) {
          oauthOptions.redirectTo = redirectTo;
        }
        await supabase.auth.signInWithOAuth({
          provider: 'discord',
          options: oauthOptions,
        });
      } catch (error) {
        console.error('[auth-check] OAuth-Start fehlgeschlagen.', error);
        setStatus('oauth', 'fail', 'OAuth-Start fehlgeschlagen. Details siehe Konsole.');
      }
    });
  }

  async function init() {
    setStatus('env', 'pending', 'Wird geprüft…');
    setStatus('client', 'pending', 'Wird geprüft…');
    setStatus('session', 'pending', 'Wird geprüft…');
    setStatus('oauth', 'ready', 'Starte den Flow, um die Weiterleitung zu überprüfen.');
    setStatus('result', 'pending', 'Kein Login durchgeführt.');

    resetPreview();

    const envInfo = globalScope.__supabaseEnv || {};
    const hasUrl = typeof envInfo.url === 'string' && envInfo.url.length > 0;
    const hasKey = typeof envInfo.anonKey === 'string' && envInfo.anonKey.length > 0;

    if (hasUrl && hasKey) {
      setStatus('env', 'success', 'URL und Anon-Key verfügbar.');
    } else {
      setStatus('env', 'fail', 'VITE_SUPABASE_URL oder VITE_SUPABASE_ANON_KEY fehlt.');
    }

    const supabase = await resolveSupabase();

    if (supabase) {
      setStatus('client', 'success', 'Supabase-Client wurde initialisiert.');
      bindLoginButton(supabase);
    } else {
      setStatus('client', 'fail', 'Supabase-Client konnte nicht erstellt werden.');
      setLoginButtonEnabled(false, 'Supabase-Client fehlt. OAuth-Test nicht möglich.');
      setStatus('session', 'fail', 'Session kann ohne Supabase nicht geprüft werden.');
      return;
    }

    const exchangeResult = await exchangeCodeIfPresent(supabase);
    await fetchSession(supabase);

    supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setStatus('result', 'success', 'Login OK.');
        setStatus('session', 'success', 'Aktive Session gefunden.');
        displayUser(session.user);
      } else {
        setStatus('session', 'success', 'Keine aktive Session.');
        setStatus('result', 'pending', 'Kein Login durchgeführt.');
        resetPreview();
      }
    });

    if (exchangeResult.handled && !exchangeResult.success) {
      setStatus('result', 'fail', 'Token konnte nicht ausgetauscht werden.');
    }
  }

  init().catch((error) => {
    console.error('[auth-check] Initialisierung fehlgeschlagen.', error);
    setStatus('result', 'fail', 'Initialisierung fehlgeschlagen.');
  });
})();

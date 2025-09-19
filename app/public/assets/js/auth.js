(function () {
  const globalScope =
    typeof window !== 'undefined'
      ? window
      : typeof self !== 'undefined'
        ? self
        : typeof globalThis !== 'undefined'
          ? globalThis
          : null;

  if (!globalScope || !globalScope.document) {
    return;
  }

  const state = {
    supabase: null,
    session: null,
    dropdownCleanup: null,
  };

  const OAUTH_FRAGMENT_KEYS = [
    'access_token',
    'refresh_token',
    'expires_in',
    'expires_at',
    'token_type',
    'provider_token',
    'provider_refresh_token',
    'type',
    'error',
    'error_description',
  ];

  const discordSvg =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="h-5 w-5"><path d="M20 4.54a19.76 19.76 0 0 0-4.93-1.54l-.23.47a18.13 18.13 0 0 1 3.85 1.56 14.82 14.82 0 0 0-5-1 14.82 14.82 0 0 0-5 1 18.28 18.28 0 0 1 3.84-1.56l-.23-.47A19.76 19.76 0 0 0 4 4.54 16.77 16.77 0 0 0 .94 16.86a19.93 19.93 0 0 0 7.08 2.61l1-1.34c-.6-.18-1.17-.42-1.72-.72l.26-.2c3.25 1.54 6.9 1.54 10.14 0l.26.2c-.55.3-1.12.54-1.72.72l1 1.34a19.94 19.94 0 0 0 7.08-2.61A16.77 16.77 0 0 0 20 4.54ZM9.08 14.28c-1 0-1.85-.9-1.85-2s.83-2 1.85-2 1.85.9 1.85 2-.83 2-1.85 2Zm5.84 0c-1 0-1.85-.9-1.85-2s.83-2 1.85-2 1.85.9 1.85 2-.83 2-1.85 2Z"/></svg>';
  const chevronSvg =
    '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" class="h-4 w-4 transition-transform duration-150"><path d="M6.7 8.7 12 14l5.3-5.3 1.4 1.4L12 16.8 5.3 10.1z"/></svg>';

  function ensureProfileContainer() {
    const doc = globalScope.document;
    let container = doc.getElementById('profile-container');

    if (!container) {
      const header = doc.querySelector('header[role="banner"]');
      const parentCandidate = header?.querySelector('.mx-auto > .flex.items-center.gap-3:last-child') ||
        header?.querySelector('.mx-auto');

      container = doc.createElement('div');
      container.id = 'profile-container';
      container.className = 'flex items-center gap-2';
      (parentCandidate || header || doc.body).appendChild(container);
    } else {
      container.classList.add('flex', 'items-center');
      container.classList.remove('gap-3');
      if (!container.classList.contains('gap-2')) {
        container.classList.add('gap-2');
      }
    }

    return container;
  }

  const container = ensureProfileContainer();
  if (!container) {
    console.error('[auth] Container #profile-container konnte nicht erstellt werden.');
    return;
  }

  function cleanupDropdown() {
    if (typeof state.dropdownCleanup === 'function') {
      try {
        state.dropdownCleanup();
      } catch (error) {
        console.warn('[auth] Fehler beim Aufräumen des Dropdowns.', error);
      }
      state.dropdownCleanup = null;
    }
  }

  function clearContainer() {
    cleanupDropdown();
    container.replaceChildren();
  }

  function formatDisplayName(user) {
    if (!user || typeof user !== 'object') {
      return 'Profil';
    }

    const metadata = (user.user_metadata && typeof user.user_metadata === 'object' && user.user_metadata) || {};
    const fallback = user.email || '';
    const candidates = [metadata.user_name, metadata.full_name, metadata.name, metadata.display_name, fallback];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }

    return 'Profil';
  }

  function resolveInitial(name) {
    if (typeof name !== 'string' || !name.trim()) {
      return 'P';
    }
    return name.trim().charAt(0).toUpperCase();
  }

  function resolveAvatarUrl(user) {
    if (!user || typeof user !== 'object') {
      return '';
    }
    const metadata = (user.user_metadata && typeof user.user_metadata === 'object' && user.user_metadata) || {};
    const candidates = [metadata.avatar_url, metadata.picture, metadata.image_url, metadata.avatar];
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return value.trim();
      }
    }
    return '';
  }

  function renderLoggedOut() {
    clearContainer();

    const wrapper = document.createElement('div');
    wrapper.className = 'relative';

    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      'inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 shadow-sm transition hover:border-emerald-500/70 hover:text-emerald-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60';

    const icon = document.createElement('span');
    icon.className = 'flex h-5 w-5 items-center justify-center text-emerald-300';
    icon.innerHTML = discordSvg;

    const label = document.createElement('span');
    label.textContent = 'Mit Discord anmelden';

    button.append(icon, label);

    button.addEventListener('click', async (event) => {
      event.preventDefault();
      if (!state.supabase) {
        console.warn('[auth] Supabase-Client nicht verfügbar.');
        return;
      }

      button.disabled = true;
      button.classList.add('cursor-wait', 'opacity-70');

      try {
        const redirectTo = globalScope.location ? globalScope.location.origin : undefined;
        await state.supabase.auth.signInWithOAuth({
          provider: 'discord',
          options: {
            scopes: 'identify email',
            redirectTo,
          },
        });
      } catch (error) {
        console.error('[auth] Discord Login fehlgeschlagen.', error);
        button.disabled = false;
        button.classList.remove('cursor-wait', 'opacity-70');
      }
    });

    wrapper.appendChild(button);
    container.appendChild(wrapper);
  }

  function renderLoggedIn(session) {
    clearContainer();

    const user = session?.user;
    const name = formatDisplayName(user);
    const avatarUrl = resolveAvatarUrl(user);
    const initials = resolveInitial(name);

    const wrapper = document.createElement('div');
    wrapper.className = 'relative';

    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      'flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/60 pl-1 pr-3 py-1.5 text-sm font-semibold text-slate-200 shadow-sm transition hover:border-emerald-500/70 hover:text-emerald-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60';
    button.setAttribute('aria-haspopup', 'menu');
    button.setAttribute('aria-expanded', 'false');

    const avatar = document.createElement('span');
    avatar.className = 'inline-flex h-6 w-6 items-center justify-center overflow-hidden rounded-full bg-slate-800/60 text-[0.65rem] font-semibold uppercase text-emerald-200 ring-1 ring-slate-700/80';

    if (avatarUrl) {
      const img = document.createElement('img');
      img.src = avatarUrl;
      img.alt = '';
      img.className = 'h-full w-full object-cover';
      avatar.textContent = '';
      avatar.appendChild(img);
    } else {
      avatar.textContent = initials;
    }

    const displayName = document.createElement('span');
    displayName.className = 'max-w-[9rem] truncate text-left';
    displayName.textContent = name;

    const chevron = document.createElement('span');
    chevron.innerHTML = chevronSvg;

    button.append(avatar, displayName, chevron);

    const dropdown = document.createElement('div');
    dropdown.className =
      'absolute right-0 top-full z-50 mt-2 min-w-[12rem] overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/95 p-1 text-sm shadow-xl shadow-emerald-500/10 backdrop-blur';
    dropdown.hidden = true;
    dropdown.setAttribute('role', 'menu');
    dropdown.setAttribute('aria-hidden', 'true');

    const profileButton = document.createElement('button');
    profileButton.type = 'button';
    profileButton.dataset.menuItem = 'profile';
    profileButton.className = 'flex w-full items-center justify-between gap-2 rounded-lg px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-900/60 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/40';
    profileButton.innerHTML = '<span>Profil</span>';

    const logoutButton = document.createElement('button');
    logoutButton.type = 'button';
    logoutButton.dataset.menuItem = 'logout';
    logoutButton.className = 'mt-1 flex w-full items-center justify-between gap-2 rounded-lg px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-900/60 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/40';
    logoutButton.innerHTML = '<span>Abmelden</span>';

    dropdown.append(profileButton, logoutButton);
    wrapper.append(button, dropdown);
    container.appendChild(wrapper);

    function setDropdownOpen(open) {
      if (open) {
        dropdown.hidden = false;
        dropdown.setAttribute('aria-hidden', 'false');
        button.setAttribute('aria-expanded', 'true');
        chevron.firstElementChild?.classList.add('rotate-180');
      } else {
        dropdown.hidden = true;
        dropdown.setAttribute('aria-hidden', 'true');
        button.setAttribute('aria-expanded', 'false');
        chevron.firstElementChild?.classList.remove('rotate-180');
      }
    }

    const handleToggle = (event) => {
      event.preventDefault();
      const isOpen = dropdown.hidden === false;
      setDropdownOpen(!isOpen);
    };

    const handleOutside = (event) => {
      if (!wrapper.contains(event.target)) {
        setDropdownOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === 'Escape' || event.key === 'Esc') {
        if (dropdown.hidden === false) {
          setDropdownOpen(false);
          try {
            button.focus({ preventScroll: true });
          } catch (error) {
            button.focus();
          }
        }
      }
    };

    button.addEventListener('click', handleToggle);
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('keydown', handleEscape);

    state.dropdownCleanup = () => {
      button.removeEventListener('click', handleToggle);
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('keydown', handleEscape);
    };

    profileButton.addEventListener('click', () => {
      setDropdownOpen(false);
      if (globalScope.ProfileModal && typeof globalScope.ProfileModal.open === 'function') {
        globalScope.ProfileModal.open(user);
      } else {
        console.warn('[auth] ProfileModal.open ist nicht verfügbar.');
      }
    });

    logoutButton.addEventListener('click', async () => {
      setDropdownOpen(false);
      if (!state.supabase) {
        console.warn('[auth] Supabase-Client nicht verfügbar.');
        return;
      }
      try {
        await state.supabase.auth.signOut();
      } catch (error) {
        console.error('[auth] Abmelden fehlgeschlagen.', error);
      }
    });
  }

  function render() {
    if (state.session) {
      renderLoggedIn(state.session);
    } else if (state.supabase) {
      renderLoggedOut();
    } else {
      clearContainer();
      const badge = document.createElement('span');
      badge.className = 'rounded-full border border-slate-800/70 px-3 py-1 text-xs text-slate-400';
      badge.textContent = 'Login derzeit nicht verfügbar';
      container.appendChild(badge);
    }
  }

  async function exchangeCodeIfPresent() {
    if (!state.supabase || !globalScope.location) {
      return;
    }
    try {
      const currentUrl = new URL(globalScope.location.href);
      const hasCode = currentUrl.searchParams.has('code');
      const hasState = currentUrl.searchParams.has('state');
      if (hasCode && hasState) {
        await state.supabase.auth.exchangeCodeForSession(globalScope.location.href);
        currentUrl.searchParams.delete('code');
        currentUrl.searchParams.delete('state');
        const newUrl = currentUrl.pathname + currentUrl.hash;
        globalScope.history.replaceState({}, '', newUrl);
      }
    } catch (error) {
      console.error('[auth] exchangeCodeForSession fehlgeschlagen.', error);
    }
  }

  function cleanupOAuthHashIfPresent() {
    if (!globalScope.location || !globalScope.history || typeof globalScope.history.replaceState !== 'function') {
      return;
    }

    const { hash, pathname, search } = globalScope.location;
    if (!hash || hash.length <= 1) {
      return;
    }

    try {
      const params = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
      const containsOAuthParams = OAUTH_FRAGMENT_KEYS.some((key) => params.has(key));

      if (!containsOAuthParams) {
        return;
      }

      const errorCode = params.get('error');
      const errorDescription = params.get('error_description');
      if (errorCode || errorDescription) {
        const messageParts = [errorCode, errorDescription].filter((part) => typeof part === 'string' && part.trim().length > 0);
        if (messageParts.length > 0) {
          console.error('[auth] OAuth-Redirect Fehler:', messageParts.join(' – '));
        }
      }

      const newUrl = `${pathname}${search || ''}`;
      globalScope.history.replaceState({}, '', newUrl);
    } catch (error) {
      console.error('[auth] OAuth-Fragment konnte nicht bereinigt werden.', error);
    }
  }

  async function refreshSession() {
    if (!state.supabase) {
      state.session = null;
      render();
      return;
    }
    try {
      const { data, error } = await state.supabase.auth.getSession();
      if (error) {
        throw error;
      }
      state.session = data?.session || null;
    } catch (error) {
      console.error('[auth] Session konnte nicht geladen werden.', error);
      state.session = null;
    }
    render();
  }

  function subscribeToAuthChanges() {
    if (!state.supabase) {
      return;
    }
    state.supabase.auth.onAuthStateChange((_event, session) => {
      state.session = session || null;
      render();
    });
  }

  async function resolveSupabaseClient() {
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
        console.error('[auth] Supabase-Initialisierung fehlgeschlagen.', error);
      }
    }
    return globalScope.supabase || null;
  }

  (async () => {
    state.supabase = await resolveSupabaseClient();
    render();

    if (!state.supabase) {
      return;
    }

    await exchangeCodeIfPresent();
    await refreshSession();
    cleanupOAuthHashIfPresent();
    subscribeToAuthChanges();
  })();
})();

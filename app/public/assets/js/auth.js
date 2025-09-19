(() => {
  const supabase = window.supabase;
  if (!supabase) {
    console.error('[auth] Supabase-Client fehlt (window.supabase).');
    return;
  }

  const $container = document.getElementById('profile-container');
  if (!$container) {
    console.error('[auth] Container #profile-container nicht gefunden.');
    return;
  }

  // --- Utils ---
  const discordIcon = () => `
    <svg viewBox="0 0 24 24" class="h-5 w-5" aria-hidden="true" focusable="false">
      <path fill="currentColor"
        d="M20 4.5a19.8 19.8 0 0 0-4.9-1.5l-.2.4c1.4.3 2.7.9 3.9 1.7a15 15 0 0 0-5.4-1.1 15 15 0 0 0-5.4 1.1c1.2-.9 2.5-1.4 3.9-1.7l-.2-.4A19.9 19.9 0 0 0 4 4.5 16.8 16.8 0 0 0 .9 16.9 20 20 0 0 0 8 19.5l1-1.3c-.6-.2-1.2-.5-1.7-.8l.4-.3c3.2 1.5 6.8 1.5 10 0l.4.3c-.5.4-1.1.6-1.7.8l1 1.3a20 20 0 0 0 7.1-2.6A16.8 16.8 0 0 0 20 4.5Zm-10.9 9.7c-1 0-1.9-.9-1.9-1.9s.9-1.9 1.9-1.9 1.9.9 1.9 1.9-.9 1.9-1.9 1.9Zm5.8 0c-1 0-1.9-.9-1.9-1.9s.9-1.9 1.9-1.9 1.9.9 1.9 1.9-.9 1.9-1.9 1.9Z"/>
    </svg>`;

  const chevronDown = () => `
    <svg viewBox="0 0 24 24" class="h-4 w-4 opacity-80" aria-hidden="true">
      <path fill="currentColor" d="M6.7 8.7 12 14l5.3-5.3 1.4 1.4L12 16.8 5.3 10.1z"/>
    </svg>`;

  let cleanupMenuHandlers = null;

  function cleanupContainer() {
    if (typeof cleanupMenuHandlers === 'function') {
      try {
        cleanupMenuHandlers();
      } finally {
        cleanupMenuHandlers = null;
      }
    }

    $container.replaceChildren();
  }

  function renderLoggedOut() {
    cleanupContainer();
    const wrap = document.createElement('div');
    wrap.className = 'relative';
    wrap.setAttribute('data-dropdown-container', '');

    wrap.innerHTML = `
      <button type="button" data-login
        class="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-slate-900/60 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60">
        <span class="text-emerald-300">${discordIcon()}</span>
        <span>Mit Discord anmelden</span>
      </button>
    `;
    $container.appendChild(wrap);

    wrap.querySelector('[data-login]')?.addEventListener('click', async () => {
      try {
        await supabase.auth.signInWithOAuth({
          provider: 'discord',
          options: { redirectTo: window.location.href.split('#')[0] }
        });
      } catch (e) {
        console.error('[auth] Login-Fehler', e);
      }
    });
  }

  function userDisplay(user) {
    const m = user?.user_metadata || {};
    const name = m.user_name || m.full_name || m.name || user.email || 'Profil';
    const avatar = m.avatar_url || null;
    return { name, avatar };
  }

  function renderLoggedIn(session) {
    cleanupContainer();
    const { user } = session;
    const { name, avatar } = userDisplay(user);

    const wrap = document.createElement('div');
    wrap.className = 'relative';
    wrap.setAttribute('data-dropdown-container', '');

    wrap.innerHTML = `
      <button type="button" data-menu-trigger
        class="inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900 px-2.5 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-900/60 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60">
        <span class="inline-flex h-6 w-6 overflow-hidden rounded-full ring-1 ring-slate-800 bg-slate-800/60">
          ${avatar ? `<img alt="" src="${avatar}" class="h-full w-full object-cover">` : `<span class="w-full translate-y-2 text-center text-[0.7rem]">${(name || '?')[0]?.toUpperCase?.() || '?'}</span>`}
        </span>
        <span class="hidden max-w-[10rem] truncate sm:inline">${name}</span>
        ${chevronDown()}
      </button>

      <div data-menu
        class="invisible absolute right-0 top-full mt-2 min-w-[12rem] overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/95 opacity-0 shadow-xl shadow-slate-900/30 transition-all">
        <button type="button" data-open-profile
          class="block w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-900/60">Profil</button>
        <div class="h-[1px] bg-slate-800/60"></div>
        <button type="button" data-logout
          class="block w-full px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-900/60">Abmelden</button>
      </div>
    `;
    $container.appendChild(wrap);

    const $trigger = wrap.querySelector('[data-menu-trigger]');
    const $menu = wrap.querySelector('[data-menu]');
    let open = false;

    function setOpen(v) {
      open = v;
      if (open) {
        $menu.classList.remove('invisible', 'opacity-0');
        $menu.classList.add('visible', 'opacity-100');
      } else {
        $menu.classList.add('invisible', 'opacity-0');
        $menu.classList.remove('visible', 'opacity-100');
      }
    }

    $trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      setOpen(!open);
    });

    const closeOnDocumentClick = () => open && setOpen(false);
    const closeOnEsc = (e) => {
      if (e.key === 'Escape' && open) setOpen(false);
    };

    document.addEventListener('click', closeOnDocumentClick);
    document.addEventListener('keydown', closeOnEsc);

    cleanupMenuHandlers = () => {
      document.removeEventListener('click', closeOnDocumentClick);
      document.removeEventListener('keydown', closeOnEsc);
    };

    wrap.querySelector('[data-open-profile]')?.addEventListener('click', () => {
      setOpen(false);
      if (window.ProfileModal && typeof window.ProfileModal.open === 'function') {
        window.ProfileModal.open(user);
      } else {
        const m = document.getElementById('profile-modal');
        if (m) m.classList.remove('hidden');
      }
    });

    wrap.querySelector('[data-logout]')?.addEventListener('click', async () => {
      try {
        await supabase.auth.signOut();
      } catch (e) {
        console.error('[auth] Logout-Fehler', e);
      }
    });
  }

  async function exchangeCodeIfPresent() {
    const url = new URL(window.location.href);
    if (url.searchParams.get('code') && url.searchParams.get('state')) {
      try {
        await supabase.auth.exchangeCodeForSession(window.location.href);
        url.searchParams.delete('code');
        url.searchParams.delete('state');
        history.replaceState({}, '', url.pathname + url.hash);
      } catch (e) {
        console.error('[auth] exchangeCodeForSession Fehler', e);
      }
    }
  }

  async function paintBySession() {
    const { data } = await supabase.auth.getSession();
    if (data?.session) renderLoggedIn(data.session);
    else renderLoggedOut();
  }

  // Init
  (async () => {
    await exchangeCodeIfPresent();
    await paintBySession();
    supabase.auth.onAuthStateChange((_ev, session) => {
      if (session) renderLoggedIn(session);
      else renderLoggedOut();
    });
  })();
})();

(() => {
  const supabase = window.supabase;
  if (!supabase) {
    console.error('[auth] Supabase-Client fehlt (window.supabase).');
    return;
  }

  function ensureContainer() {
    let container = document.getElementById('profile-container');
    if (container) return container;

    const fallbackParent =
      document.querySelector('header[role="banner"] nav')?.parentElement ??
      document.querySelector('header[role="banner"] .mx-auto');

    if (!fallbackParent) return null;

    container = document.createElement('div');
    container.id = 'profile-container';
    container.className = 'flex items-center';
    fallbackParent.appendChild(container);
    return container;
  }

  const $container = ensureContainer();
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
=======
const globalScope =
  typeof window !== 'undefined' ? window : typeof globalThis !== 'undefined' ? globalThis : null;

const state = {
  supabase: null,
  session: null,
  pending: false,
  loading: false,
  subscription: null,
};

let containerElement = null;
let menuWrapperElement = null;
let menuButtonElement = null;
let menuChevronElement = null;
let dropdownElement = null;
let outsideEventHandler = null;
let escapeEventHandler = null;
let hasInitialized = false;

function getDocument() {
  return globalScope && typeof globalScope.document !== 'undefined'
    ? globalScope.document
    : null;
}

function waitForSupabaseClient(maxAttempts = 50, intervalMs = 100) {
  if (!globalScope) {
    return Promise.resolve(null);
  }

  if (globalScope.supabase) {
    return Promise.resolve(globalScope.supabase);
  }

  const attempts = Math.max(1, Math.floor(maxAttempts));
  const delay = Math.max(0, Math.floor(intervalMs));

  return new Promise((resolve) => {
    let currentAttempt = 0;

    const checkClient = () => {
      if (globalScope.supabase) {
        resolve(globalScope.supabase);
        return;
      }

      currentAttempt += 1;
      if (currentAttempt >= attempts) {
        resolve(null);
        return;
      }

      globalScope.setTimeout(checkClient, delay);
    };

    checkClient();
  });
}

function sanitizeString(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : '';
}

function getUserDisplayName(user) {
  if (!user || typeof user !== 'object') {
    return 'Mitglied';
  }

  const metadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {};
  const candidates = [
    metadata.full_name,
    metadata.display_name,
    metadata.name,
    metadata.user_name,
    metadata.username,
    metadata.preferred_username,
    user.email,
  ];

  for (const candidate of candidates) {
    const normalized = sanitizeString(candidate);
    if (normalized) {
      if (candidate === user.email) {
        const [localPart] = normalized.split('@');
        if (localPart && localPart.trim()) {
          return localPart.trim();
        }
      }
      return normalized;
    }
  }

  return 'Mitglied';
}

function getUserAvatarUrl(user) {
  if (!user || typeof user !== 'object') {
    return '';
  }

  const metadata = user.user_metadata && typeof user.user_metadata === 'object' ? user.user_metadata : {};
  const candidates = [metadata.avatar_url, metadata.picture, metadata.avatar, metadata.image_url];

  for (const candidate of candidates) {
    const normalized = sanitizeString(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return '';
}

function getUserInitials(user, fallbackName) {
  const name = sanitizeString(fallbackName) || getUserDisplayName(user);
  if (!name) {
    return 'U';
  }

  const segments = name.split(/\s+/u).filter(Boolean);
  if (segments.length === 0) {
    return name.slice(0, 2).toUpperCase();
  }

  const initials = segments.slice(0, 2).map((segment) => segment[0]).join('');
  return initials.toUpperCase();
}

function cleanupDropdownListeners() {
  const doc = getDocument();
  if (!doc) {
    outsideEventHandler = null;
    escapeEventHandler = null;
    return;
  }

  if (outsideEventHandler) {
    doc.removeEventListener('pointerdown', outsideEventHandler, true);
    outsideEventHandler = null;
  }

  if (escapeEventHandler) {
    doc.removeEventListener('keydown', escapeEventHandler, true);
    escapeEventHandler = null;
  }
}

function closeDropdown(options = {}) {
  const { focusButton = false } = options;
  if (dropdownElement) {
    dropdownElement.hidden = true;
    dropdownElement.setAttribute('aria-hidden', 'true');
  }

  if (menuButtonElement) {
    menuButtonElement.setAttribute('aria-expanded', 'false');
    if (focusButton) {
      try {
        menuButtonElement.focus({ preventScroll: true });
      } catch {
        try {
          menuButtonElement.focus();
        } catch {
          // ignore focus issues
        }
      }
    }
  }

  if (menuChevronElement) {
    menuChevronElement.classList.remove('rotate-180');
  }

  cleanupDropdownListeners();
}

function openDropdown() {
  if (!dropdownElement || !menuButtonElement || !menuWrapperElement) {
    return;
  }

  dropdownElement.hidden = false;
  dropdownElement.setAttribute('aria-hidden', 'false');
  menuButtonElement.setAttribute('aria-expanded', 'true');

  if (menuChevronElement) {
    menuChevronElement.classList.add('rotate-180');
  }

  cleanupDropdownListeners();

  const doc = getDocument();
  if (!doc) {
    return;
  }

  outsideEventHandler = (event) => {
    const target = event?.target;
    if (!menuWrapperElement || !target) {
      return;
    }

    if (!menuWrapperElement.contains(target)) {
      closeDropdown();
    }
  };

  escapeEventHandler = (event) => {
    if (event?.key === 'Escape' || event?.key === 'Esc') {
      closeDropdown({ focusButton: true });
    }
  };

  doc.addEventListener('pointerdown', outsideEventHandler, true);
  doc.addEventListener('keydown', escapeEventHandler, true);

  if (doc.activeElement === menuButtonElement) {
    const firstItem = dropdownElement.querySelector('[data-menu-item]');
    if (firstItem instanceof HTMLElement) {
      doc.defaultView?.requestAnimationFrame(() => {
        try {
          firstItem.focus({ preventScroll: true });
        } catch {
          firstItem.focus();
        }
      });
    }
  }
}

function toggleDropdown(event) {
  if (event) {
    event.preventDefault();
  }

  if (!dropdownElement) {
    return;
  }

  if (dropdownElement.hidden) {
    openDropdown();
  } else {
    closeDropdown({ focusButton: true });
  }
}

function createSvgElement(pathData) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', pathData);
  svg.appendChild(path);
  return svg;
}

function createDiscordIcon() {
  const icon = createSvgElement(
    'M20.317 4.37a19.79 19.79 0 00-4.885-1.515.074.074 0 00-.078.037c-.211.375-.445.865-.608 1.25-1.845-.276-3.68-.276-5.487 0-.164-.393-.406-.874-.618-1.25a.077.077 0 00-.078-.037 19.736 19.736 0 00-4.885 1.515.07.07 0 00-.032.028C.533 9.046-.31 13.58.099 18.058a.082.082 0 00.031.056c2.053 1.508 4.041 2.423 5.993 3.03a.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.042-.106 12.24 12.24 0 01-1.872-.892.077.077 0 01-.008-.128c.126-.094.252-.192.372-.291a.074.074 0 01.078-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 01.079.01c.12.099.246.198.373.292a.077.077 0 01-.007.127 12.3 12.3 0 01-1.873.891.077.077 0 00-.04.107c.36.698.772 1.363 1.225 1.993a.076.076 0 00.084.029c1.961-.607 3.95-1.522 6.003-3.03a.077.077 0 00.031-.055c.5-5.177-.838-9.674-3.548-13.66a.061.061 0 00-.031-.028zM8.02 15.331c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.156 2.419.001 1.333-.955 2.419-2.156 2.419zm7.975 0c-1.183 0-2.157-1.086-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.095 2.156 2.419.001 1.333-.946 2.419-2.156 2.419z'
  );
  icon.classList.add('h-4', 'w-4', 'text-indigo-400');
  icon.setAttribute('fill', 'currentColor');
  return icon;
}

function createChevronIcon() {
  const icon = createSvgElement('M6 9l6 6 6-6');
  icon.classList.add('h-4', 'w-4', 'text-slate-400', 'transition-transform', 'duration-150', 'ease-out');
  icon.setAttribute('fill', 'none');
  icon.setAttribute('stroke', 'currentColor');
  icon.setAttribute('stroke-width', '1.5');
  icon.setAttribute('stroke-linecap', 'round');
  icon.setAttribute('stroke-linejoin', 'round');
  return icon;
}

function createAvatarElement(user, displayName) {
  const avatarWrapper = document.createElement('span');
  avatarWrapper.className =
    'flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-slate-800/80 bg-slate-800 text-xs font-semibold uppercase text-slate-200';
  avatarWrapper.setAttribute('aria-hidden', 'true');

  const avatarUrl = getUserAvatarUrl(user);
  if (avatarUrl) {
    const image = document.createElement('img');
    image.src = avatarUrl;
    image.alt = displayName ? `Avatar von ${displayName}` : 'Profilbild';
    image.className = 'h-full w-full object-cover';
    avatarWrapper.appendChild(image);
    return avatarWrapper;
  }

  avatarWrapper.textContent = getUserInitials(user, displayName);
  return avatarWrapper;
}

function handleProfileClick(event) {
  event?.preventDefault();
  closeDropdown();

  const modal = globalScope && globalScope.ProfileModal;
  const user = state.session?.user;
  if (!modal || typeof modal.open !== 'function' || !user) {
    return;
  }

  try {
    modal.open(user);
  } catch (error) {
    console.error('Fehler beim Öffnen des Profilmodals', error);
  }
}

async function handleSignOut(event) {
  event?.preventDefault();
  closeDropdown();

  if (!state.supabase || state.pending) {
    return;
  }

  state.pending = true;
  renderAuthState();

  try {
    const { error } = await state.supabase.auth.signOut();
    if (error) {
      throw error;
    }
    state.session = null;
    state.pending = false;
    renderAuthState();
  } catch (error) {
    console.error('Abmelden fehlgeschlagen', error);
    state.pending = false;
    renderAuthState();
  }
}

async function handleSignIn(event) {
  event?.preventDefault();

  if (!state.supabase || state.pending) {
    return;
  }

  state.pending = true;
  renderAuthState();

  try {
    const redirectBase = globalScope?.location?.href ? globalScope.location.href.split('#')[0] : undefined;
    const { error } = await state.supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: redirectBase ? { redirectTo: redirectBase } : {},
    });

    if (error) {
      throw error;
    }
    state.pending = false;
    renderAuthState();
  } catch (error) {
    console.error('Login fehlgeschlagen', error);
    state.pending = false;
    renderAuthState();
  }
}

function buildLoginButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className =
    'inline-flex items-center gap-2 rounded-full border border-slate-800/80 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-200 shadow-sm transition hover:border-emerald-500/70 hover:text-emerald-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60';
  button.addEventListener('click', handleSignIn);

  const icon = createDiscordIcon();
  const label = document.createElement('span');
  label.className = 'whitespace-nowrap';
  label.textContent = state.loading ? 'Lädt…' : 'Mit Discord anmelden';

  button.append(icon, label);

  if (!state.supabase || state.pending || state.loading) {
    button.disabled = true;
    button.classList.add('cursor-not-allowed', 'opacity-60');
    button.setAttribute('aria-disabled', 'true');
  }

  return button;
}

function buildMenu(session) {
  const user = session?.user;
  const displayName = getUserDisplayName(user);

  const wrapper = document.createElement('div');
  wrapper.className = 'relative flex items-center';

  const button = document.createElement('button');
  button.type = 'button';
  button.className =
    'flex items-center gap-3 rounded-full border border-slate-800/80 bg-slate-900/60 pl-1 pr-3 py-1.5 text-sm font-semibold text-slate-200 shadow-sm transition hover:border-emerald-500/70 hover:text-emerald-200 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  button.addEventListener('click', toggleDropdown);

  const avatar = createAvatarElement(user, displayName);

  const name = document.createElement('span');
  name.className = 'max-w-[9rem] truncate text-left text-sm font-semibold text-slate-200';
  name.textContent = displayName;

  const chevron = createChevronIcon();

  button.append(avatar, name, chevron);

  if (state.pending) {
    button.disabled = true;
    button.classList.add('cursor-wait', 'opacity-60');
    button.setAttribute('aria-disabled', 'true');
  }

  const dropdown = document.createElement('div');
  dropdown.className =
    'absolute right-0 top-full z-50 mt-2 w-48 rounded-xl border border-slate-800/80 bg-slate-950/95 p-1 shadow-xl shadow-emerald-500/10 backdrop-blur';
  dropdown.hidden = true;
  dropdown.setAttribute('role', 'menu');
  dropdown.setAttribute('aria-hidden', 'true');

  const profileButton = document.createElement('button');
  profileButton.type = 'button';
  profileButton.dataset.menuItem = 'profile';
  profileButton.className =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-200 transition hover:bg-slate-900 hover:text-emerald-200 focus:outline-none focus-visible:bg-slate-900 focus-visible:text-emerald-200 focus-visible:ring focus-visible:ring-emerald-500/60';
  profileButton.textContent = 'Profil';
  profileButton.addEventListener('click', handleProfileClick);

  const logoutButton = document.createElement('button');
  logoutButton.type = 'button';
  logoutButton.dataset.menuItem = 'sign-out';
  logoutButton.className =
    'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-rose-300 transition hover:bg-rose-400/10 hover:text-rose-200 focus:outline-none focus-visible:bg-rose-400/10 focus-visible:text-rose-100 focus-visible:ring focus-visible:ring-rose-500/40';
  logoutButton.textContent = 'Abmelden';
  logoutButton.addEventListener('click', handleSignOut);

  dropdown.append(profileButton, logoutButton);

  wrapper.append(button, dropdown);

  menuWrapperElement = wrapper;
  menuButtonElement = button;
  menuChevronElement = chevron;
  dropdownElement = dropdown;

  return wrapper;
}

function renderAuthState() {
  if (!containerElement) {
    return;
  }

  closeDropdown();

  menuWrapperElement = null;
  menuButtonElement = null;
  menuChevronElement = null;
  dropdownElement = null;

  containerElement.innerHTML = '';

  if (!state.supabase) {
    containerElement.appendChild(buildLoginButton());
    return;
  }

  if (!state.session || !state.session.user) {
    containerElement.appendChild(buildLoginButton());
    return;
  }

  containerElement.appendChild(buildMenu(state.session));
}

async function refreshSession() {
  if (!state.supabase) {
    state.session = null;
    state.loading = false;
    renderAuthState();
    return null;
  }

  state.loading = true;
  renderAuthState();

  try {
    const { data, error } = await state.supabase.auth.getSession();
    if (error) {
      throw error;
    }
    state.session = data?.session ?? null;
  } catch (error) {
    console.error('Konnte Sitzung nicht laden', error);
    state.session = null;
  } finally {
    state.loading = false;
    state.pending = false;
    renderAuthState();
  }

  return state.session;
}

async function exchangeCodeFromUrl() {
  if (!state.supabase || !globalScope?.location) {
    return;
  }

  let url;
  try {
    url = new URL(globalScope.location.href);
  } catch {
    return;
  }

  if (!url.search) {
    return;
  }

  const params = url.searchParams;
  if (!params.has('code') || !params.has('state')) {
    return;
  }

  try {
    const { error } = await state.supabase.auth.exchangeCodeForSession(url.href);
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error('Fehler beim Austausch des Auth-Codes', error);
  } finally {
    const cleanUrl = `${url.origin}${url.pathname}${url.hash ?? ''}`;
    try {
      globalScope.history?.replaceState({}, getDocument()?.title || '', cleanUrl);
    } catch (historyError) {
      console.warn('Konnte URL nach Auth nicht bereinigen', historyError);
    }
  }
}

function subscribeToAuthChanges() {
  if (!state.supabase || typeof state.supabase.auth?.onAuthStateChange !== 'function') {
    return;
  }

  if (state.subscription) {
    state.subscription.unsubscribe?.();
    state.subscription = null;
  }

  const { data } = state.supabase.auth.onAuthStateChange((_event, session) => {
    state.session = session;
    state.pending = false;
    state.loading = false;
    renderAuthState();
  });

  if (data?.subscription) {
    state.subscription = data.subscription;
  }
}

async function initializeAuth() {
  if (hasInitialized) {
    return;
  }

  hasInitialized = true;

  state.loading = true;
  renderAuthState();

  state.supabase = await waitForSupabaseClient();
  if (!state.supabase) {
    state.loading = false;
    renderAuthState();
    return;
  }

  await exchangeCodeFromUrl();
  await refreshSession();
  subscribeToAuthChanges();
}

function setupAuthUi() {
  const doc = getDocument();
  if (!doc) {
    return;
  }

  const run = () => {
    if (containerElement && containerElement.isConnected) {
      return;
    }

    const target = doc.getElementById('profile-container');
    if (!target) {
      return;
    }

    containerElement = target;
    initializeAuth();
  };

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}

setupAuthUi();


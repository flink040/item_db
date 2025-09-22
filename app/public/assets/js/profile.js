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

  const MODERATION_DROPDOWN_SELECTOR = '[data-profile-dropdown]';
  const MODERATION_ITEM_SELECTOR = '[data-menu-item="moderation"]';
  const MODERATION_CLASSES =
    'block w-full rounded-lg px-4 py-2 text-left text-sm text-slate-200 hover:bg-slate-900/60 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/40';
  const MODERATION_ROLES = new Set(['moderator', 'admin']);

  const moderationModal = doc.getElementById('moderation-modal');
  const moderationOverlay =
    moderationModal &&
    (moderationModal.querySelector('[data-moderation-overlay]') || moderationModal);
  const moderationCloseButtons =
    moderationModal instanceof HTMLElement
      ? Array.from(moderationModal.querySelectorAll('[data-moderation-close]'))
      : [];

  let moderationLastTrigger = null;
  let moderationIsOpen = false;

  function normalizeRole(role) {
    if (typeof role !== 'string') {
      return '';
    }
    return role.trim().toLowerCase();
  }

  function getFocusableElements(container) {
    if (!(container instanceof HTMLElement)) {
      return [];
    }

    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ];

    return Array.from(container.querySelectorAll(selectors.join(','))).filter((element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }

      if (element.hasAttribute('disabled')) {
        return false;
      }

      if (element.getAttribute('aria-hidden') === 'true') {
        return false;
      }

      if (element.hidden || element.closest('[hidden]')) {
        return false;
      }

      if (element.closest('[aria-hidden="true"]')) {
        return false;
      }

      return true;
    });
  }

  function focusElement(element) {
    if (!(element instanceof HTMLElement)) {
      return;
    }
    try {
      element.focus({ preventScroll: true });
    } catch (error) {
      void error;
      element.focus();
    }
  }

  function handleModerationKeydown(event) {
    if (!moderationIsOpen || !(moderationModal instanceof HTMLElement)) {
      return;
    }

    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      closeModerationModal();
      return;
    }

    if (event.key !== 'Tab') {
      return;
    }

    const focusable = getFocusableElements(moderationModal);
    if (focusable.length === 0) {
      event.preventDefault();
      focusElement(moderationModal);
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    const shifted = Boolean(event.shiftKey);

    if (shifted) {
      if (!active || active === first || !moderationModal.contains(active)) {
        event.preventDefault();
        focusElement(last);
      }
    } else if (!active || active === last || !moderationModal.contains(active)) {
      event.preventDefault();
      focusElement(first);
    }
  }

  function openModerationModal(trigger) {
    if (!(moderationModal instanceof HTMLElement)) {
      console.warn('[profile] Moderations-Modal ist nicht im Dokument verfügbar.');
      return;
    }

    if (moderationIsOpen) {
      return;
    }

    moderationLastTrigger = trigger instanceof HTMLElement ? trigger : null;
    moderationIsOpen = true;
    moderationModal.classList.remove('hidden');
    moderationModal.setAttribute('aria-hidden', 'false');

    const [firstFocusable] = getFocusableElements(moderationModal);
    if (firstFocusable) {
      focusElement(firstFocusable);
    } else {
      focusElement(moderationModal);
    }

    doc.addEventListener('keydown', handleModerationKeydown, true);
  }

  function closeModerationModal() {
    if (!(moderationModal instanceof HTMLElement)) {
      return;
    }

    if (!moderationIsOpen) {
      return;
    }

    moderationIsOpen = false;
    moderationModal.classList.add('hidden');
    moderationModal.setAttribute('aria-hidden', 'true');
    doc.removeEventListener('keydown', handleModerationKeydown, true);

    if (moderationLastTrigger) {
      focusElement(moderationLastTrigger);
    }

    moderationLastTrigger = null;
  }

  if (moderationModal instanceof HTMLElement) {
    if (moderationOverlay instanceof HTMLElement) {
      moderationOverlay.addEventListener('click', (event) => {
        if (event.target === moderationOverlay) {
          closeModerationModal();
        }
      });
    }

    moderationCloseButtons.forEach((button) => {
      button.addEventListener('click', (event) => {
        event.preventDefault();
        closeModerationModal();
      });
    });
  }

  function resolveModerationDropdown(options = {}) {
    if (options && options.dropdown instanceof HTMLElement) {
      return options.dropdown;
    }

    return doc.querySelector(MODERATION_DROPDOWN_SELECTOR);
  }

  function removeModerationEntry(dropdown) {
    if (dropdown instanceof HTMLElement) {
      const existing = dropdown.querySelector(MODERATION_ITEM_SELECTOR);
      if (existing instanceof HTMLElement) {
        existing.remove();
      }
      return;
    }

    const fallbacks = Array.from(doc.querySelectorAll(MODERATION_ITEM_SELECTOR));
    fallbacks.forEach((element) => {
      if (element instanceof HTMLElement) {
        element.remove();
      }
    });
  }

  function showModerationLink(role, options = {}) {
    const dropdown = resolveModerationDropdown(options);
    const normalizedRole = normalizeRole(role);

    if (!MODERATION_ROLES.has(normalizedRole)) {
      removeModerationEntry(dropdown);
      return null;
    }

    if (!(dropdown instanceof HTMLElement)) {
      return null;
    }

    let button = dropdown.querySelector(MODERATION_ITEM_SELECTOR);

    if (!(button instanceof HTMLButtonElement)) {
      button = doc.createElement('button');
      button.type = 'button';
      button.dataset.menuItem = 'moderation';
      button.className = `${MODERATION_CLASSES} mt-1`;
      button.textContent = 'Moderation';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        openModerationModal(button);
      });

      const logoutButton = dropdown.querySelector('[data-menu-item="logout"]');
      if (logoutButton instanceof HTMLElement && logoutButton.parentElement === dropdown) {
        dropdown.insertBefore(button, logoutButton);
      } else {
        dropdown.appendChild(button);
      }
    }

    return button;
  }

  globalScope.showModerationLink = showModerationLink;

  if (moderationModal instanceof HTMLElement) {
    globalScope.ModerationModal = {
      open: openModerationModal,
      close: closeModerationModal,
    };
  }

  const overlay = doc.querySelector('[data-profile-modal-overlay]');
  if (!overlay) {
    console.warn('[profile] Profil-Modal-Markup fehlt.');
    globalScope.ProfileModal = {
      open() {
        console.warn('[profile] Profil-Modal kann nicht geöffnet werden, da kein Markup vorhanden ist.');
      },
      close() {
        /* noop */
      },
    };
    return;
  }

  const avatarFrame = overlay.querySelector('[data-profile-avatar]');
  const avatarImage = overlay.querySelector('[data-profile-avatar-image]');
  const avatarFallback = overlay.querySelector('[data-profile-avatar-fallback]');
  const displayNameEl = overlay.querySelector('[data-profile-display-name]');
  const itemsEl = overlay.querySelector('[data-profile-items]');
  const likesEl = overlay.querySelector('[data-profile-likes]');
  const loadingEl = overlay.querySelector('[data-profile-loading]');
  const errorEl = overlay.querySelector('[data-profile-error]');
  const closeButtons = overlay.querySelectorAll('[data-profile-close]');

  let lastFocusedElement = null;
  let isOpen = false;
  let activeFetchToken = 0;

  function setHidden(element, hidden) {
    if (!element) {
      return;
    }
    if (hidden) {
      element.classList.add('hidden');
    } else {
      element.classList.remove('hidden');
    }
  }

  function sanitizeDisplayName(user) {
    if (!user || typeof user !== 'object') {
      return 'Profil';
    }
    const metadata = (user.user_metadata && typeof user.user_metadata === 'object' && user.user_metadata) || {};
    const fallback = user.email || '';
    const candidates = [metadata.user_name, metadata.full_name, metadata.name, metadata.display_name, fallback];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    return 'Profil';
  }

  function resolveAvatar(user) {
    if (!user || typeof user !== 'object') {
      return { url: '', fallback: 'P' };
    }
    const metadata = (user.user_metadata && typeof user.user_metadata === 'object' && user.user_metadata) || {};
    const candidates = [metadata.avatar_url, metadata.picture, metadata.image_url, metadata.avatar];
    for (const value of candidates) {
      if (typeof value === 'string' && value.trim().length > 0) {
        return { url: value.trim(), fallback: '' };
      }
    }
    const name = sanitizeDisplayName(user);
    const initial = name && name.trim() ? name.trim().charAt(0).toUpperCase() : 'P';
    return { url: '', fallback: initial };
  }

  function updateAvatar(user) {
    const { url, fallback } = resolveAvatar(user);
    if (avatarImage) {
      avatarImage.src = url || '';
      avatarImage.alt = url ? `${sanitizeDisplayName(user)} Avatar` : '';
      setHidden(avatarImage, !url);
    }
    if (avatarFallback) {
      avatarFallback.textContent = fallback || '–';
      setHidden(avatarFallback, Boolean(url));
    }
    if (avatarFrame && !url) {
      avatarFrame.classList.add('bg-slate-900/80');
    }
  }

  function updateCounts(itemsCount, likesCount) {
    if (itemsEl) {
      itemsEl.textContent = typeof itemsCount === 'number' ? String(itemsCount) : '0';
    }
    if (likesEl) {
      likesEl.textContent = typeof likesCount === 'number' ? String(likesCount) : '0';
    }
  }

  function setLoadingState(isLoading) {
    setHidden(loadingEl, !isLoading);
  }

  function setErrorState(hasError, message) {
    if (!errorEl) {
      if (hasError) {
        console.warn('[profile] ' + (message || 'Unbekannter Fehler beim Laden der Statistiken.'));
      }
      return;
    }
    if (hasError) {
      errorEl.textContent = message || 'Statistiken konnten nicht geladen werden.';
      errorEl.classList.remove('hidden');
    } else {
      errorEl.classList.add('hidden');
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
        console.error('[profile] Supabase-Client konnte nicht geladen werden.', error);
      }
    }
    return globalScope.supabase || null;
  }

  async function tryCountLikes(supabase, table, itemIds) {
    if (!supabase || !table || !Array.isArray(itemIds) || itemIds.length === 0) {
      return { count: 0, missing: false, errored: false };
    }
    try {
      const { count, error } = await supabase
        .from(table)
        .select('*', { count: 'exact', head: true })
        .in('item_id', itemIds);
      if (error) {
        throw error;
      }
      return { count: typeof count === 'number' ? count : 0, missing: false, errored: false };
    } catch (error) {
      const message = (error && (error.message || error.details)) || '';
      const code = error && error.code ? String(error.code) : '';
      const tableMissing =
        code === '42P01' || code === 'PGRST302' || /does not exist/i.test(message) || /not exist/i.test(message);
      if (tableMissing) {
        console.warn(`[profile] Tabelle "${table}" wurde nicht gefunden.`, error);
        return { count: 0, missing: true, errored: false };
      }
      console.warn(`[profile] Fehler beim Abrufen der Likes aus "${table}".`, error);
      return { count: 0, missing: false, errored: true };
    }
  }

  async function fetchStats(user) {
    const supabase = await resolveSupabase();
    if (!supabase) {
      setErrorState(true, 'Supabase-Client nicht verfügbar.');
      return { items: 0, likes: 0 };
    }

    let itemsCount = 0;
    let likesCount = 0;
    let hadError = false;

    try {
      const { count, error } = await supabase
        .from('items')
        .select('*', { count: 'exact', head: true })
        .eq('created_by', user.id);
      if (error) {
        throw error;
      }
      itemsCount = typeof count === 'number' ? count : 0;
    } catch (error) {
      console.warn('[profile] Konnte Anzahl der Items nicht ermitteln.', error);
      hadError = true;
    }

    let itemIds = [];
    if (itemsCount > 0) {
      try {
        const { data, error } = await supabase
          .from('items')
          .select('id')
          .eq('created_by', user.id);
        if (error) {
          throw error;
        }
        itemIds = Array.isArray(data) ? data.map((row) => row?.id).filter((id) => id !== null && id !== undefined) : [];
      } catch (error) {
        console.warn('[profile] Konnte Item-IDs nicht laden.', error);
        hadError = true;
        itemIds = [];
      }
    }

    if (itemIds.length > 0) {
      const primary = await tryCountLikes(supabase, 'item_likes', itemIds);
      if (primary.missing) {
        const fallback = await tryCountLikes(supabase, 'likes', itemIds);
        likesCount = fallback.count;
        if (!fallback.missing && fallback.errored) {
          hadError = true;
        }
        if (fallback.missing) {
          likesCount = 0;
        }
      } else {
        likesCount = primary.count;
        if (primary.errored) {
          hadError = true;
        }
      }
    }

    setErrorState(hadError, hadError ? 'Daten konnten nicht vollständig geladen werden.' : '');
    return { items: itemsCount, likes: likesCount };
  }

  function onKeydown(event) {
    if (!isOpen) {
      return;
    }
    if (event.key === 'Escape' || event.key === 'Esc') {
      event.preventDefault();
      modal.close();
    }
  }

  function openModal(user) {
    if (!overlay) {
      return;
    }

    lastFocusedElement = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
    overlay.classList.remove('hidden');
    overlay.setAttribute('aria-hidden', 'false');
    isOpen = true;

    const closeButton = overlay.querySelector('[data-profile-close]');
    if (closeButton instanceof HTMLElement) {
      try {
        closeButton.focus({ preventScroll: true });
      } catch (error) {
        closeButton.focus();
      }
    }

    doc.addEventListener('keydown', onKeydown, true);

    const name = sanitizeDisplayName(user);
    if (displayNameEl) {
      displayNameEl.textContent = name;
    }
    updateAvatar(user);
    if (itemsEl) {
      itemsEl.textContent = '–';
    }
    if (likesEl) {
      likesEl.textContent = '–';
    }
    setLoadingState(true);
    setErrorState(false);

    const fetchToken = ++activeFetchToken;
    fetchStats(user)
      .then((result) => {
        if (fetchToken !== activeFetchToken) {
          return;
        }
        updateCounts(result.items, result.likes);
      })
      .catch((error) => {
        console.error('[profile] Fehler beim Laden der Statistiken.', error);
        setErrorState(true, 'Statistiken konnten nicht geladen werden.');
      })
      .finally(() => {
        if (fetchToken === activeFetchToken) {
          setLoadingState(false);
        }
      });
  }

  function closeModal() {
    if (!overlay) {
      return;
    }
    overlay.classList.add('hidden');
    overlay.setAttribute('aria-hidden', 'true');
    isOpen = false;
    activeFetchToken += 1;
    doc.removeEventListener('keydown', onKeydown, true);
    if (lastFocusedElement) {
      try {
        lastFocusedElement.focus({ preventScroll: true });
      } catch (error) {
        lastFocusedElement.focus();
      }
      lastFocusedElement = null;
    }
  }

  const modal = {
    open: openModal,
    close: closeModal,
  };

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay) {
      closeModal();
    }
  });

  closeButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      closeModal();
    });
  });

  globalScope.ProfileModal = modal;
})();

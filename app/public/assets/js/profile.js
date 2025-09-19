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

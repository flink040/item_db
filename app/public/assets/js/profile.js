(() => {
  const supabase = window.supabase;
  if (!supabase) return;

  const $modal = document.getElementById('profile-modal');
  const $avatarWrap = $modal.querySelector('[data-profile-avatar]');
  const $avatarImg  = $modal.querySelector('[data-profile-avatar-image]');
  const $avatarFallback = $modal.querySelector('[data-profile-avatar-fallback]');
  const $displayName = $modal.querySelector('[data-profile-display-name]');
  const $itemsCount  = $modal.querySelector('[data-profile-items]');
  const $likesCount  = $modal.querySelector('[data-profile-likes]');
  const $loading     = $modal.querySelector('[data-profile-loading]');
  const $error       = $modal.querySelector('[data-profile-error]');

  function setAvatar({ name, avatar }) {
    if (avatar) {
      $avatarImg.src = avatar;
      $avatarImg.alt = name ? `Avatar von ${name}` : 'Avatar';
      $avatarImg.classList.remove('hidden');
      $avatarFallback.classList.add('hidden');
    } else {
      $avatarImg.classList.add('hidden');
      $avatarFallback.classList.remove('hidden');
      $avatarFallback.textContent = (name || '?')[0]?.toUpperCase?.() || '?';
    }
  }

  function nameFromUser(user) {
    const m = user?.user_metadata || {};
    return m.user_name || m.full_name || m.name || user.email || '—';
  }

  async function countSubmittedItems(userId) {
    const { count, error } = await supabase
      .from('items')
      .select('*', { count: 'exact', head: true })
      .eq('created_by', userId);
    if (error) {
      console.warn('[profile] Items Count Error', error);
      return 0;
    }
    return count || 0;
  }

  async function countReceivedLikes(userId) {
    try {
      // 1) Item-IDs des Users laden
      const { data: items, error: itemsErr } = await supabase
        .from('items')
        .select('id')
        .eq('created_by', userId);
      if (itemsErr || !items?.length) return 0;

      const ids = items.map(i => i.id);
      // 2) Mögliches Likes-Tabellen-Set
      const candidates = ['item_likes', 'likes'];
      for (const table of candidates) {
        const { count, error } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })
          .in('item_id', ids);
        if (!error) return count || 0;
      }
      return 0;
    } catch (e) {
      console.warn('[profile] Likes Count Error', e);
      return 0;
    }
  }

  async function loadStats(user) {
    $loading.classList.remove('hidden');
    $error.classList.add('hidden');
    try {
      const [items, likes] = await Promise.all([
        countSubmittedItems(user.id),
        countReceivedLikes(user.id),
      ]);
      $itemsCount.textContent = items.toString();
      $likesCount.textContent = likes.toString();
    } catch (e) {
      $error.textContent = 'Profilstatistiken konnten nicht geladen werden.';
      $error.classList.remove('hidden');
    } finally {
      $loading.classList.add('hidden');
    }
  }

  function open(user) {
    const name = nameFromUser(user);
    const avatar = user?.user_metadata?.avatar_url || null;

    $displayName.textContent = name;
    setAvatar({ name, avatar });
    $modal.classList.remove('hidden');

    // Stats laden
    $itemsCount.textContent = '–';
    $likesCount.textContent = '–';
    loadStats(user);
  }

  function close() {
    $modal.classList.add('hidden');
  }

  $modal.querySelector('[data-profile-modal-overlay]')?.addEventListener('click', close);
  $modal.querySelector('[data-profile-close]')?.addEventListener('click', close);

  window.ProfileModal = { open, close };
})();

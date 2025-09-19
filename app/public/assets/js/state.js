const FILTER_KEYS = ['type', 'material', 'rarity'];
const FILTER_KEY_SET = new Set(FILTER_KEYS);

function createDefaultFilters() {
  const filters = {};
  FILTER_KEYS.forEach((key) => {
    filters[key] = '';
  });
  return filters;
}

function ensureFilterShape(source = {}) {
  const next = { ...source };
  FILTER_KEYS.forEach((key) => {
    const value = next[key];
    if (typeof value === 'string') {
      next[key] = value;
      return;
    }

    if (value === null || value === undefined) {
      next[key] = '';
      return;
    }

    next[key] = String(value);
  });
  return next;
}

function applyFilterValue(target, key, value) {
  const normalizedKey = typeof key === 'string' ? key.trim() : '';
  if (!normalizedKey || !target || typeof target !== 'object') {
    return;
  }

  if (value === null || value === undefined) {
    if (FILTER_KEY_SET.has(normalizedKey)) {
      target[normalizedKey] = '';
    } else {
      delete target[normalizedKey];
    }
    return;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      if (FILTER_KEY_SET.has(normalizedKey)) {
        target[normalizedKey] = '';
      } else {
        delete target[normalizedKey];
      }
      return;
    }

    target[normalizedKey] = trimmed;
    return;
  }

  target[normalizedKey] = value;
}

const state = {
  filters: createDefaultFilters(),
  searchQuery: '',
  page: 1,
  pageSize: 6,
  items: [],
  allItems: [],
  itemsCache: Object.create(null),
};

const listeners = new Set();

export function getState() {
  return {
    filters: { ...state.filters },
    searchQuery: state.searchQuery,
    page: state.page,
    pageSize: state.pageSize,
    items: [...state.items],
    allItems: [...state.allItems],
  };
}

export function getFilters() {
  return { ...state.filters };
}

function notify() {
  const snapshot = getState();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('State subscriber failed', error);
    }
  });
}

function shallowEqual(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }

  return keysA.every((key) => Object.is(a[key], b[key]));
}

function normalizeCacheQuery(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim().toLowerCase();
  return trimmed;
}

function normalizeCacheFilters(filters) {
  if (!filters || typeof filters !== 'object') {
    return '';
  }

  return Object.entries(filters)
    .filter(([key, value]) => {
      if (!key) {
        return false;
      }

      if (value === null || value === undefined) {
        return false;
      }

      if (typeof value === 'string') {
        return value.trim().length > 0;
      }

      return true;
    })
    .map(([key, value]) => {
      const normalizedKey = key.toString().trim().toLowerCase();
      const normalizedValue = typeof value === 'string' ? value.trim().toLowerCase() : String(value);
      return `${normalizedKey}:${normalizedValue}`;
    })
    .sort()
    .join('|');
}

function normalizeCachePageSize(pageSize) {
  if (pageSize === Number.POSITIVE_INFINITY) {
    return 'all';
  }

  if (Number.isFinite(pageSize) && pageSize > 0) {
    return String(Math.floor(pageSize));
  }

  return 'default';
}

function createItemsCacheKey({ page, pageSize, searchQuery, filters } = {}) {
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
  const safePageSize = normalizeCachePageSize(pageSize);
  const normalizedQuery = normalizeCacheQuery(searchQuery);
  const normalizedFilters = normalizeCacheFilters(filters);
  return `${safePage}|${safePageSize}|${normalizedQuery}|${normalizedFilters}`;
}

export function getCachedItemsPage(descriptor = {}) {
  const key = createItemsCacheKey(descriptor);
  const cached = state.itemsCache[key];
  if (!cached) {
    return null;
  }

  const items = Array.isArray(cached.items) ? [...cached.items] : [];
  const totalItems = Number.isFinite(cached.totalItems) && cached.totalItems >= 0
    ? Math.floor(cached.totalItems)
    : items.length;

  return { items, totalItems };
}

export function setCachedItemsPage(descriptor = {}, payload = {}) {
  const key = createItemsCacheKey(descriptor);
  const items = Array.isArray(payload.items) ? [...payload.items] : [];
  const totalItems = Number.isFinite(payload.totalItems) && payload.totalItems >= 0
    ? Math.floor(payload.totalItems)
    : items.length;

  state.itemsCache[key] = { items, totalItems };
  return state.itemsCache[key];
}

export function clearItemsCache() {
  state.itemsCache = Object.create(null);
}

export function setFilters(filters = {}, { replace = false } = {}) {
  const base = replace ? createDefaultFilters() : ensureFilterShape(state.filters);
  const next = { ...base };

  Object.entries(filters ?? {}).forEach(([key, value]) => {
    applyFilterValue(next, key, value);
  });

  const finalFilters = ensureFilterShape(next);
  const changed = !shallowEqual(finalFilters, state.filters);

  if (changed) {
    state.filters = finalFilters;
    notify();
  }

  return { ...state.filters };
}

export function setFilter(name, value) {
  const key = typeof name === 'string' ? name.trim() : '';
  if (!key) {
    return { ...state.filters };
  }

  return setFilters({ [key]: value });
}

export function setSearchQuery(query = '') {
  state.searchQuery = query;
  notify();
}

export function setPage(page = 1) {
  const value = Number.parseInt(page, 10);
  if (!Number.isNaN(value) && value > 0) {
    if (state.page !== value) {
      state.page = value;
      notify();
    }
  }
  return state.page;
}

export function setPageSize(size) {
  const value = Number.parseInt(size, 10);
  if (!Number.isNaN(value) && value > 0) {
    if (state.pageSize !== value) {
      state.pageSize = value;
      notify();
    }
  }
  return state.pageSize;
}

export function setItems(items = []) {
  state.items = Array.isArray(items) ? [...items] : [];
  notify();
}

export function setAllItems(items = []) {
  clearItemsCache();
  state.allItems = Array.isArray(items) ? [...items] : [];
  notify();
}

export function subscribe(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

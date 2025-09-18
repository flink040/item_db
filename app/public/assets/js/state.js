const state = {
  filters: {},
  searchQuery: '',
  page: 1,
  pageSize: 6,
  items: [],
  allItems: [],
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

export function setFilters(filters = {}, { replace = false } = {}) {
  const next = replace ? {} : { ...state.filters };
  const entries = Object.entries(filters ?? {});

  if (replace && entries.length === 0) {
    if (!shallowEqual(state.filters, {})) {
      state.filters = {};
      notify();
    }
    return { ...state.filters };
  }

  entries.forEach(([key, value]) => {
    const normalized = typeof value === 'string' ? value.trim() : value;
    if (normalized === '' || normalized === null || normalized === undefined) {
      delete next[key];
      return;
    }

    next[key] = normalized;
  });

  const changed = !shallowEqual(next, state.filters);
  if (changed) {
    state.filters = next;
    notify();
  }

  return { ...state.filters };
}

export function setSearchQuery(query = '') {
  state.searchQuery = query;
  notify();
}

export function setPage(page = 1) {
  const value = Number.parseInt(page, 10);
  if (!Number.isNaN(value) && value > 0) {
    state.page = value;
    notify();
  }
  return state.page;
}

export function setPageSize(size) {
  const value = Number.parseInt(size, 10);
  if (!Number.isNaN(value) && value > 0) {
    state.pageSize = value;
    notify();
  }
  return state.pageSize;
}

export function setItems(items = []) {
  state.items = Array.isArray(items) ? [...items] : [];
  notify();
}

export function setAllItems(items = []) {
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

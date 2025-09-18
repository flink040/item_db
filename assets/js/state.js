/**
 * Minimal reactive-ish state container for the OP Item DB frontend.
 */

const state = {
  searchQuery: '',
  filters: {
    type: '',
    material: '',
    rarity: '',
  },
  page: 1,
  pageSize: 6,
  items: [],
};

const listeners = new Set();

function cloneFilters(filters) {
  return {
    type: filters.type ?? '',
    material: filters.material ?? '',
    rarity: filters.rarity ?? '',
  };
}

function shallowEqual(a, b) {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) {
    return false;
  }
  return keysA.every((key) => a[key] === b[key]);
}

function notify() {
  const snapshot = getState();
  listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error('[state] Listener execution failed:', error);
    }
  });
}

export function getState() {
  return {
    searchQuery: state.searchQuery,
    filters: cloneFilters(state.filters),
    page: state.page,
    pageSize: state.pageSize,
    items: [...state.items],
  };
}

export function subscribe(listener) {
  if (typeof listener !== 'function') {
    throw new TypeError('State listener must be a function.');
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function setState(partial = {}) {
  let changed = false;

  if (Object.prototype.hasOwnProperty.call(partial, 'searchQuery')) {
    const nextQuery = (partial.searchQuery ?? '').toString();
    if (state.searchQuery !== nextQuery) {
      state.searchQuery = nextQuery;
      changed = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(partial, 'filters')) {
    const nextFilters = cloneFilters({ ...state.filters, ...partial.filters });
    if (!shallowEqual(state.filters, nextFilters)) {
      state.filters = nextFilters;
      changed = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(partial, 'page')) {
    const nextPage = Number.parseInt(partial.page, 10) || 1;
    if (state.page !== nextPage) {
      state.page = nextPage;
      changed = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(partial, 'pageSize')) {
    const nextPageSize = Number.parseInt(partial.pageSize, 10) || state.pageSize;
    if (state.pageSize !== nextPageSize) {
      state.pageSize = nextPageSize;
      changed = true;
    }
  }

  if (Object.prototype.hasOwnProperty.call(partial, 'items')) {
    state.items = Array.isArray(partial.items) ? [...partial.items] : [];
    changed = true;
  }

  if (changed) {
    notify();
  }
}

export function setSearchQuery(query) {
  setState({ searchQuery: query, page: 1 });
}

export function setFilters(filters) {
  setState({ filters, page: 1 });
}

export function setPage(page) {
  setState({ page });
}

export function setPageSize(pageSize) {
  setState({ pageSize });
}

export function setItems(items) {
  setState({ items });
}

export function clearItems() {
  setState({ items: [] });
}

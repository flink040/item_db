const state = {
  filters: {},
  searchQuery: '',
  page: 1,
  pageSize: 6,
  items: [],
};

const listeners = new Set();

export function getState() {
  return {
    filters: { ...state.filters },
    searchQuery: state.searchQuery,
    page: state.page,
    pageSize: state.pageSize,
    items: [...state.items],
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

export function setFilters(filters = {}) {
  state.filters = { ...filters };
  notify();
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

export function subscribe(listener) {
  if (typeof listener !== 'function') {
    return () => {};
  }

  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

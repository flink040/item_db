/**
 * Entry point for the OP Item DB preview frontend.
 */

import { refs, qsa } from './dom.js';
import { getState, subscribe, setFilters, setItems, setSearchQuery } from './state.js';
import { getItems } from './api.js';
import { renderEmptyState, renderGrid, renderSkeleton } from './ui.js';
import { closeModal, openModal } from './modal.js';

const RECENT_LIMIT = 5;
const recentQueries = [];
let isLoading = false;
let initialized = false;

function normalizeTerm(value) {
  return value?.toString().trim() ?? '';
}

function addRecentSearch(term) {
  const normalized = normalizeTerm(term);
  if (!normalized) return;

  recentQueries.unshift(normalized);
  const unique = [...new Set(recentQueries)];
  recentQueries.length = 0;
  recentQueries.push(...unique.slice(0, RECENT_LIMIT));
  renderRecentSearches();
}

function renderRecentSearches() {
  const container = refs.recentSearches;
  if (!container) return;

  container.innerHTML = '';

  if (recentQueries.length === 0) {
    const placeholder = document.createElement('p');
    placeholder.className = 'text-sm text-slate-500';
    placeholder.textContent = 'Noch keine Suchanfragen gespeichert.';
    container.appendChild(placeholder);
    return;
  }

  const list = document.createElement('div');
  list.className = 'flex flex-wrap gap-2';

  recentQueries.forEach((term) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className =
      'rounded-full border border-slate-800/80 bg-slate-900/60 px-3 py-1 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:text-slate-100 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60';
    button.textContent = term;
    button.dataset.searchTerm = term;
    list.appendChild(button);
  });

  container.appendChild(list);
}

function handleRecentSearchClick(event) {
  const trigger = event.target.closest('button[data-search-term]');
  if (!trigger) return;

  const term = trigger.dataset.searchTerm ?? '';
  const input = refs.searchInput;
  if (input) {
    input.value = term;
    input.focus();
  }

  setSearchQuery(term);
  addRecentSearch(term);
  loadItems();
}

function registerRecentSearches() {
  const container = refs.recentSearches;
  if (!container) return;
  container.addEventListener('click', handleRecentSearchClick);
}

function registerSearchForm() {
  const form = refs.searchForm;
  if (!form) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const formData = new FormData(form);

    const searchQuery = normalizeTerm(formData.get('search'));
    const filters = {
      type: normalizeTerm(formData.get('type')),
      material: normalizeTerm(formData.get('material')),
      rarity: normalizeTerm(formData.get('rarity')),
    };

    setSearchQuery(searchQuery);
    setFilters(filters);
    addRecentSearch(searchQuery);
    loadItems();
  });
}

function registerModalControls() {
  const modal = refs.itemModal;
  if (!modal) return;

  qsa('[data-open-item-modal]').forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      openModal(modal);
    });
  });

  qsa('[data-modal-close]', modal).forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      event.preventDefault();
      closeModal();
    });
  });

  const overlay = modal.querySelector('[data-modal-overlay]');
  if (overlay) {
    overlay.addEventListener('click', (event) => {
      event.preventDefault();
      closeModal();
    });
  }

  const form = refs.itemModalForm;
  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      closeModal();
    });
  }
}

function handleStateChange(state) {
  if (isLoading) {
    return;
  }

  if (state.items.length > 0) {
    renderGrid(state.items);
  } else {
    renderEmptyState();
  }
}

async function loadItems() {
  const currentState = getState();
  isLoading = true;
  renderSkeleton(4);

  try {
    const { items } = await getItems({
      page: currentState.page,
      pageSize: currentState.pageSize,
      search: currentState.searchQuery,
      filters: currentState.filters,
    });
    isLoading = false;
    setItems(items);
  } catch (error) {
    isLoading = false;
    console.error('[app] Failed to load items', error);
    renderEmptyState('Beim Laden der Items ist ein Fehler aufgetreten.');
  }
}

function init() {
  if (initialized) return;
  initialized = true;

  subscribe(handleStateChange);
  registerSearchForm();
  registerRecentSearches();
  registerModalControls();

  renderSkeleton(4);
  loadItems();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}

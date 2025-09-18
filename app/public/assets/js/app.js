import { refs } from './dom.js';
import { getState, setFilters, setItems, setPage, setSearchQuery, subscribe } from './state.js';
import { getItems, loadItemById } from './api.js';
import { renderEmptyState, renderGrid, renderSkeleton } from './ui.js';
import { openModal } from './modal.js';

let activeRequestId = 0;

function createLayout() {
  const root = refs.root;
  if (!root || root.dataset.appInitialized === 'true') {
    return;
  }

  root.innerHTML = `
    <div class="app-shell">
      <header class="app-shell__header">
        <h1 class="app-shell__title">OP Item DB Vorschau</h1>
        <button
          type="button"
          class="app-shell__menu-btn"
          data-js="mobile-menu-btn"
          aria-expanded="false"
          aria-controls="app-menu"
        >
          Menü
        </button>
        <nav id="app-menu" class="app-shell__menu" data-js="mobile-menu" hidden>
          <a href="#item-grid">Zur Liste</a>
        </nav>
      </header>
      <main class="app-shell__main">
        <section class="app-shell__search">
          <form class="app-search" data-js="search-form" role="search" aria-label="Items durchsuchen">
            <label class="app-search__label" for="app-search-input">Suche</label>
            <input
              id="app-search-input"
              class="app-search__input"
              name="search"
              type="search"
              data-js="search-input"
              placeholder="Items durchsuchen"
              autocomplete="off"
            />
            <label class="app-search__label" for="app-filter-rarity">Seltenheit</label>
            <select
              id="app-filter-rarity"
              class="app-search__select"
              name="rarity"
              data-js="filter-rarity"
            >
              <option value="">Alle Seltenheiten</option>
              <option value="gewöhnlich">Gewöhnlich</option>
              <option value="selten">Selten</option>
              <option value="episch">Episch</option>
              <option value="legendär">Legendär</option>
            </select>
            <button type="submit" class="app-search__submit">Suchen</button>
          </form>
        </section>
        <section id="item-grid" class="app-shell__grid" data-js="grid" aria-live="polite" aria-busy="false"></section>
        <section class="app-shell__empty" data-js="empty-state" hidden></section>
      </main>
    </div>
    <div class="app-modal" data-js="modal" role="dialog" aria-modal="true" aria-hidden="true" hidden>
      <div class="app-modal__backdrop" data-js="modal-backdrop" tabindex="-1"></div>
      <div class="app-modal__dialog" role="document">
        <button type="button" class="app-modal__close" data-js="modal-close" aria-label="Schließen">×</button>
        <div class="app-modal__body" data-js="modal-body"></div>
      </div>
    </div>
  `;

  root.dataset.appInitialized = 'true';
}

function registerEventListeners() {
  const form = refs.searchForm;
  if (form) {
    form.addEventListener('submit', handleSearchSubmit);
  }

  const grid = refs.gridContainer;
  if (grid) {
    grid.addEventListener('click', handleGridClick);
  }

  const menuBtn = refs.mobileMenuBtn;
  if (menuBtn) {
    menuBtn.addEventListener('click', (event) => {
      event.preventDefault();
      toggleMobileMenu();
    });
  }
}

function toggleMobileMenu() {
  const button = refs.mobileMenuBtn;
  const menu = refs.mobileMenu;
  if (!button || !menu) {
    return;
  }

  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded));
  menu.hidden = expanded;
}

function handleSearchSubmit(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const formData = new FormData(form);
  const query = (formData.get('search') ?? '').toString().trim();
  const rarity = (formData.get('rarity') ?? '').toString().trim();

  setSearchQuery(query);
  setFilters({ rarity });
  setPage(1);

  loadAndRenderItems();
}

function handleGridClick(event) {
  const trigger = event.target instanceof Element ? event.target.closest('[data-item-id]') : null;
  if (!trigger) {
    return;
  }

  const { itemId } = trigger.dataset;
  if (!itemId) {
    return;
  }

  showItemDetails(itemId);
}

function buildModalContent(item) {
  const container = document.createElement('div');
  container.className = 'app-modal__content';

  const title = document.createElement('h2');
  title.className = 'app-modal__title';
  title.textContent = item.name;

  const description = document.createElement('p');
  description.className = 'app-modal__description';
  description.textContent = item.description || 'Keine Beschreibung verfügbar.';

  const details = document.createElement('dl');
  details.className = 'app-modal__meta';

  const metaEntries = [
    ['Seltenheit', item.rarity || 'unbekannt'],
    ['Typ', item.type || 'unbekannt'],
    ['Material', item.material || 'unbekannt'],
  ];

  metaEntries.forEach(([label, value]) => {
    const term = document.createElement('dt');
    term.textContent = label;
    const definition = document.createElement('dd');
    definition.textContent = value;
    details.append(term, definition);
  });

  container.append(title, description, details);
  return container;
}

async function showItemDetails(itemId) {
  try {
    const item = await loadItemById(itemId);
    openModal(buildModalContent(item));
  } catch (error) {
    console.error('Fehler beim Laden eines Items', error);
    const fallback = document.createElement('div');
    fallback.className = 'app-modal__error';
    fallback.textContent = 'Details konnten nicht geladen werden.';
    openModal(fallback);
  }
}

async function loadAndRenderItems() {
  const requestId = ++activeRequestId;
  const { page, pageSize, searchQuery, filters } = getState();

  renderSkeleton(pageSize);

  try {
    const response = await getItems({
      page,
      pageSize,
      search: searchQuery,
      filters,
    });

    if (requestId !== activeRequestId) {
      return;
    }

    setItems(response.items);

    if (response.items.length > 0) {
      renderGrid(response.items);
    } else {
      renderEmptyState();
    }
  } catch (error) {
    console.error('Fehler beim Laden der Items', error);
    renderEmptyState('Die Liste konnte nicht geladen werden.');
  }
}

function registerStateSync() {
  subscribe((snapshot) => {
    const input = refs.searchInput;
    if (input && input.value !== snapshot.searchQuery) {
      input.value = snapshot.searchQuery;
    }

    const raritySelect = refs.filterRarity;
    const rarity = snapshot.filters?.rarity ?? '';
    if (raritySelect && raritySelect.value !== rarity) {
      raritySelect.value = rarity;
    }
  });
}

function init() {
  createLayout();
  registerEventListeners();
  registerStateSync();
  loadAndRenderItems();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

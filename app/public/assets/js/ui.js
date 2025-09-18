import { refs } from './dom.js';

function createMetaRow(label, value) {
  const row = document.createElement('p');
  row.className = 'item-card__meta';

  const strong = document.createElement('strong');
  strong.textContent = `${label}: `;

  const span = document.createElement('span');
  span.textContent = value;

  row.append(strong, span);
  return row;
}

function createGridItem(item) {
  const article = document.createElement('article');
  article.className = 'item-card';
  article.dataset.itemId = String(item.id);

  const title = document.createElement('h2');
  title.className = 'item-card__title';
  title.textContent = item.name;

  const description = document.createElement('p');
  description.className = 'item-card__description';
  description.textContent = item.description || 'Keine Beschreibung vorhanden.';

  const metaWrapper = document.createElement('div');
  metaWrapper.className = 'item-card__meta-wrapper';
  metaWrapper.append(
    createMetaRow('Seltenheit', item.rarity || 'unbekannt'),
    createMetaRow('Typ', item.type || 'unbekannt'),
    createMetaRow('Material', item.material || 'unbekannt'),
  );

  const action = document.createElement('button');
  action.type = 'button';
  action.className = 'item-card__action';
  action.dataset.itemId = String(item.id);
  action.textContent = 'Details';

  article.append(title, description, metaWrapper, action);
  return article;
}

export function renderGrid(items = []) {
  const grid = refs.gridContainer;
  const empty = refs.emptyState;
  if (!grid) {
    return;
  }

  grid.innerHTML = '';

  if (!Array.isArray(items) || items.length === 0) {
    renderEmptyState();
    grid.setAttribute('aria-busy', 'false');
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    fragment.appendChild(createGridItem(item));
  });

  grid.appendChild(fragment);
  grid.setAttribute('aria-busy', 'false');

  if (empty) {
    empty.hidden = true;
  }
}

export function renderEmptyState(message = 'Keine Einträge gefunden.') {
  const grid = refs.gridContainer;
  const empty = refs.emptyState;

  if (grid) {
    grid.innerHTML = '';
    grid.setAttribute('aria-busy', 'false');
  }

  if (empty) {
    empty.hidden = false;
    empty.textContent = message;
  }
}

export function renderSkeleton(count = 4) {
  const grid = refs.gridContainer;
  const empty = refs.emptyState;

  if (!grid) {
    return;
  }

  grid.innerHTML = '';
  grid.setAttribute('aria-busy', 'true');

  const fragment = document.createDocumentFragment();
  const safeCount = Number.isFinite(count) && count > 0 ? Math.floor(count) : 4;

  for (let index = 0; index < safeCount; index += 1) {
    const placeholder = document.createElement('div');
    placeholder.className = 'item-card item-card--skeleton';
    placeholder.setAttribute('aria-hidden', 'true');

    const line = document.createElement('div');
    line.className = 'item-card__line';
    line.textContent = 'Lade Item...';

    placeholder.appendChild(line);
    fragment.appendChild(placeholder);
  }

  grid.appendChild(fragment);

  if (empty) {
    empty.hidden = true;
  }
}

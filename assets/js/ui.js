/**
 * Render helpers for the OP Item DB preview frontend.
 */

import { refs } from './dom.js';

function getResultsContainer() {
  const container = refs.resultsContainer;
  if (!container) {
    console.warn('[ui] Results container is missing.');
  }
  return container;
}

function clearElement(element) {
  if (!element) return;
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function createSkeletonCard() {
  const card = document.createElement('article');
  card.className = 'animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-inner shadow-slate-950/30';

  const titleLine = document.createElement('div');
  titleLine.className = 'h-5 w-3/5 rounded bg-slate-800/70';

  const metaLine = document.createElement('div');
  metaLine.className = 'mt-3 h-3 w-1/3 rounded bg-slate-800/60';

  const paragraph = document.createElement('div');
  paragraph.className = 'mt-4 space-y-2';

  const lineOne = document.createElement('div');
  lineOne.className = 'h-3 w-full rounded bg-slate-800/40';

  const lineTwo = document.createElement('div');
  lineTwo.className = 'h-3 w-11/12 rounded bg-slate-800/40';

  const lineThree = document.createElement('div');
  lineThree.className = 'h-3 w-2/3 rounded bg-slate-800/40';

  paragraph.append(lineOne, lineTwo, lineThree);
  card.append(titleLine, metaLine, paragraph);

  return card;
}

function formatLabel(value) {
  if (!value) return '';
  return value
    .toString()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function createItemCard(item) {
  const card = document.createElement('article');
  card.className = 'rounded-2xl border border-slate-800/80 bg-slate-900/60 p-5 shadow-inner shadow-slate-950/40';

  const header = document.createElement('div');
  header.className = 'flex flex-wrap items-start justify-between gap-3';

  const titleWrapper = document.createElement('div');
  titleWrapper.className = 'space-y-1';

  const title = document.createElement('h3');
  title.className = 'text-base font-semibold text-slate-100';
  title.textContent = item.name;

  const meta = document.createElement('p');
  meta.className = 'text-xs uppercase tracking-[0.35em] text-slate-500';
  const metaParts = [formatLabel(item.type), formatLabel(item.material)].filter(Boolean);
  meta.textContent = metaParts.join(' • ');

  titleWrapper.append(title, meta);

  const rarityBadge = document.createElement('span');
  rarityBadge.className =
    'inline-flex items-center rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-300';
  rarityBadge.textContent = formatLabel(item.rarity);

  header.append(titleWrapper, rarityBadge);

  const description = document.createElement('p');
  description.className = 'mt-4 text-sm leading-relaxed text-slate-400';
  description.textContent = item.description;

  card.append(header, description);

  return card;
}

export function renderSkeleton(count = 4) {
  const container = getResultsContainer();
  if (!container) return;

  clearElement(container);
  const safeCount = Math.max(1, Number.parseInt(count, 10) || 1);
  const fragment = document.createDocumentFragment();
  for (let index = 0; index < safeCount; index += 1) {
    fragment.appendChild(createSkeletonCard());
  }
  container.appendChild(fragment);
}

export function renderGrid(items) {
  const container = getResultsContainer();
  if (!container) return;

  clearElement(container);
  if (!Array.isArray(items) || items.length === 0) {
    renderEmptyState();
    return;
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item) => {
    fragment.appendChild(createItemCard(item));
  });
  container.appendChild(fragment);
}

export function renderEmptyState(message = 'Keine Items gefunden.') {
  const container = getResultsContainer();
  if (!container) return;

  clearElement(container);

  const wrapper = document.createElement('div');
  wrapper.className = 'rounded-2xl border border-dashed border-slate-800/80 bg-slate-900/30 p-10 text-center';

  const headline = document.createElement('p');
  headline.className = 'text-sm font-semibold text-slate-200';
  headline.textContent = message;

  const hint = document.createElement('p');
  hint.className = 'mt-2 text-xs text-slate-500';
  hint.textContent = 'Passe Suche oder Filter an, um neue Items zu entdecken.';

  wrapper.append(headline, hint);
  container.appendChild(wrapper);
}

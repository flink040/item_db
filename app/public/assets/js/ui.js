import { refs } from './dom.js';

const rarityStyles = {
  gewöhnlich: {
    label: 'Gewöhnlich',
    className: 'border border-slate-800 bg-slate-900/60 text-slate-300',
  },
  selten: {
    label: 'Selten',
    className: 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-200',
  },
  episch: {
    label: 'Episch',
    className: 'border border-indigo-500/40 bg-indigo-500/10 text-indigo-200',
  },
  legendär: {
    label: 'Legendär',
    className: 'border border-purple-500/40 bg-purple-500/10 text-purple-200',
  },
};

const fallbackRarity = {
  label: 'Unbekannt',
  className: 'border border-slate-800 bg-slate-900/60 text-slate-300',
};

function normalizeLabel(value, fallback) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized.length > 0 ? normalized : fallback;
}

function formatSlug(item) {
  const source = normalizeLabel(item.slug ?? item.id ?? item.name, '').toLowerCase();
  if (!source) {
    return 'unbekannt';
  }

  return source.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'unbekannt';
}

function getRarityMeta(value) {
  if (!value) {
    return fallbackRarity;
  }

  const key = value.toString().toLowerCase();
  return rarityStyles[key] ?? {
    label: normalizeLabel(value, fallbackRarity.label),
    className: fallbackRarity.className,
  };
}

function createBadgeDot(colorClass) {
  const dot = document.createElement('span');
  dot.className = `h-2 w-2 rounded-full ${colorClass}`;
  return dot;
}

function createInfoPill(text, colorClass, fallbackText) {
  const pill = document.createElement('span');
  pill.className = 'inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1';

  const dot = createBadgeDot(colorClass);
  const label = document.createElement('span');
  label.textContent = normalizeLabel(text, fallbackText);

  pill.append(dot, label);
  return pill;
}

function createItemCard(item) {
  const article = document.createElement('article');
  article.className = 'relative rounded-2xl border border-slate-800/70 bg-slate-900/60 p-5 shadow-2xl shadow-emerald-500/5';
  article.dataset.itemId = String(item.id);

  const wrapper = document.createElement('div');
  wrapper.className = 'flex flex-col gap-4';
  article.appendChild(wrapper);

  const header = document.createElement('div');
  header.className = 'flex items-start gap-4';
  wrapper.appendChild(header);

  const avatar = document.createElement('span');
  avatar.className = 'relative flex h-14 w-14 flex-shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-500/10 text-lg font-semibold text-emerald-200 ring-1 ring-inset ring-emerald-500/30';
  avatar.textContent = normalizeLabel(item.name, '?').charAt(0).toUpperCase() || '?';
  header.appendChild(avatar);

  const meta = document.createElement('div');
  meta.className = 'flex-1 space-y-3';
  header.appendChild(meta);

  const slug = document.createElement('p');
  slug.className = 'text-xs uppercase tracking-[0.3em] text-slate-500';
  slug.textContent = formatSlug(item);
  meta.appendChild(slug);

  const title = document.createElement('h3');
  title.className = 'text-lg font-semibold text-slate-100';
  title.textContent = normalizeLabel(item.name, 'Unbenanntes Item');
  meta.appendChild(title);

  const rarityRow = document.createElement('div');
  rarityRow.className = 'flex flex-wrap items-center gap-2';
  meta.appendChild(rarityRow);

  const rarityMeta = getRarityMeta(item.rarity);
  const rarityBadge = document.createElement('span');
  rarityBadge.className = `inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${rarityMeta.className}`;
  rarityBadge.textContent = rarityMeta.label;
  rarityRow.appendChild(rarityBadge);

  if (item.description) {
    const description = document.createElement('p');
    description.className = 'text-sm leading-relaxed text-slate-400';
    description.textContent = item.description;
    wrapper.appendChild(description);
  }

  const metaRow = document.createElement('div');
  metaRow.className = 'flex flex-wrap items-center gap-3 text-xs text-slate-500';
  metaRow.append(
    createInfoPill(item.type, 'bg-emerald-400', 'Unbekannter Typ'),
    createInfoPill(item.material, 'bg-indigo-400', 'Unbekanntes Material'),
  );
  wrapper.appendChild(metaRow);

  const actionRow = document.createElement('div');
  actionRow.className = 'flex justify-end';
  wrapper.appendChild(actionRow);

  const actionButton = document.createElement('button');
  actionButton.type = 'button';
  actionButton.dataset.itemId = String(item.id);
  actionButton.className = 'inline-flex items-center gap-2 rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition hover:border-slate-500 hover:text-slate-100 focus:outline-none focus-visible:ring focus-visible:ring-emerald-500/60';
  actionButton.textContent = 'Details ansehen';
  actionRow.appendChild(actionButton);

  return article;
}

function createSkeletonCard() {
  const article = document.createElement('article');
  article.className = 'relative overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-900/40 p-5 shadow-2xl shadow-emerald-500/5';
  article.setAttribute('aria-hidden', 'true');

  const wrapper = document.createElement('div');
  wrapper.className = 'flex animate-pulse flex-col gap-4';
  article.appendChild(wrapper);

  const header = document.createElement('div');
  header.className = 'flex items-start gap-4';
  wrapper.appendChild(header);

  const avatar = document.createElement('div');
  avatar.className = 'flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-xl bg-slate-800/60';
  header.appendChild(avatar);

  const meta = document.createElement('div');
  meta.className = 'flex-1 space-y-3';
  header.appendChild(meta);

  const slugLine = document.createElement('div');
  slugLine.className = 'h-2 w-24 rounded bg-slate-800/70';
  meta.appendChild(slugLine);

  const titleLine = document.createElement('div');
  titleLine.className = 'h-3 w-32 rounded bg-slate-800/70';
  meta.appendChild(titleLine);

  const badgeLine = document.createElement('div');
  badgeLine.className = 'h-5 w-28 rounded-full bg-slate-800/70';
  meta.appendChild(badgeLine);

  const descriptionLine = document.createElement('div');
  descriptionLine.className = 'h-3 w-full rounded bg-slate-800/60';
  wrapper.appendChild(descriptionLine);

  const descriptionLineShort = document.createElement('div');
  descriptionLineShort.className = 'h-3 w-2/3 rounded bg-slate-800/60';
  wrapper.appendChild(descriptionLineShort);

  const metaRow = document.createElement('div');
  metaRow.className = 'flex flex-wrap items-center gap-3';
  wrapper.appendChild(metaRow);

  for (let index = 0; index < 2; index += 1) {
    const pill = document.createElement('div');
    pill.className = 'h-6 w-32 rounded-full bg-slate-800/60';
    metaRow.appendChild(pill);
  }

  const actionRow = document.createElement('div');
  actionRow.className = 'flex justify-end';
  wrapper.appendChild(actionRow);

  const actionPlaceholder = document.createElement('div');
  actionPlaceholder.className = 'h-9 w-32 rounded-lg bg-slate-800/60';
  actionRow.appendChild(actionPlaceholder);

  return article;
}

export function renderGrid(items = []) {
  const grid = refs.gridContainer;
  const empty = refs.emptyState;
  if (!grid) {
    return;
  }


  if (!Array.isArray(items) || items.length === 0) {
    renderEmptyState();
    return;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';

  items.forEach((item) => {
    wrapper.appendChild(createItemCard(item));
  });

  grid.innerHTML = '';
  grid.appendChild(wrapper);

  grid.setAttribute('aria-busy', 'false');

  if (empty) {
    empty.hidden = true;
    empty.innerHTML = '';

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
    const panel = document.createElement('div');
    panel.className = 'rounded-xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-400';
    panel.textContent = message;
    empty.innerHTML = '';
    empty.appendChild(panel);
  }
}

export function renderSkeleton(count = 6) {
  const grid = refs.gridContainer;
  const empty = refs.emptyState;

  if (!grid) {
    return;
  }

  const numeric = Number.isFinite(count) ? Math.floor(count) : 0;
  const safeCount = Math.max(1, Math.min(12, numeric || 6));

  const wrapper = document.createElement('div');
  wrapper.className = 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3';

  for (let index = 0; index < safeCount; index += 1) {
    wrapper.appendChild(createSkeletonCard());
  }

  grid.innerHTML = '';
  grid.appendChild(wrapper);
  grid.setAttribute('aria-busy', 'true');

  if (empty) {
    empty.hidden = true;
    empty.innerHTML = '';

  }
}

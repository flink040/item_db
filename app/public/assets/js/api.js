const MOCK_ITEMS = [
  {
    id: 'iron-sword',
    name: 'Eiserne Klinge',
    description: 'Eine zuverlässige Nahkampfwaffe für angehende Abenteurer:innen.',
    rarity: 'gewöhnlich',
    material: 'Eisen',
    type: 'Waffe',
  },
  {
    id: 'crystal-wand',
    name: 'Kristallstab',
    description: 'Ein schimmernder Stab, der arkane Energie bündelt und verstärkt.',
    rarity: 'selten',
    material: 'Kristall',
    type: 'Magie',
  },
  {
    id: 'ember-bow',
    name: 'Glutfunkenbogen',
    description: 'Entfesselt feurige Pfeile, die auch im Regen weiterlodern.',
    rarity: 'episch',
    material: 'Esche',
    type: 'Fernkampf',
  },
  {
    id: 'guardian-shield',
    name: 'Wächter-Schild',
    description: 'Ein Schild mit Runen, die bei Treffern kurzzeitig Schutzschilde erzeugen.',
    rarity: 'selten',
    material: 'Stahl',
    type: 'Verteidigung',
  },
  {
    id: 'luminous-amulet',
    name: 'Leuchtendes Amulett',
    description: 'Speichert Sonnenlicht und gibt es als warme Heilungswelle wieder ab.',
    rarity: 'legendär',
    material: 'Gold',
    type: 'Schmuck',
  },
  {
    id: 'herbal-kit',
    name: 'Kräuterset',
    description: 'Eine Sammlung seltene Kräuter, perfekt für Alchemie-Anfänger:innen.',
    rarity: 'gewöhnlich',
    material: 'Leinen',
    type: 'Handwerk',
  },
  {
    id: 'frost-dagger',
    name: 'Frostdolch',
    description: 'Ein Dolch, der Gegner mit einer einzigen Berührung vereist.',
    rarity: 'episch',
    material: 'Mithril',
    type: 'Waffe',
  },
  {
    id: 'sky-boots',
    name: 'Himmelsläufer',
    description: 'Leichte Stiefel, mit denen sich kurze Strecken durch die Luft gleiten lässt.',
    rarity: 'selten',
    material: 'Leder',
    type: 'Rüstung',
  },
];

const delay = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

function toError(error, fallbackMessage) {
  if (error instanceof Error && error.message) {
    return error;
  }

  return new Error(fallbackMessage);
}

function sanitizeFilters(filters) {
  if (!filters || typeof filters !== 'object') {
    return {};
  }

  return Object.entries(filters).reduce((accumulator, [key, value]) => {
    if (value === undefined || value === null) {
      return accumulator;
    }

    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed.length === 0) {
        return accumulator;
      }
      accumulator[key] = trimmed;
      return accumulator;
    }

    accumulator[key] = value;
    return accumulator;
  }, {});
}

export async function getItems({ page = 1, pageSize = 6, search = '', filters = {} } = {}) {
  const normalizedPage = Number(page);
  if (!Number.isFinite(normalizedPage) || normalizedPage < 1) {
    throw new Error('Ungültige Seitenzahl.');
  }

  const allowAll = pageSize === Number.POSITIVE_INFINITY;
  const normalizedPageSize = allowAll ? Number.POSITIVE_INFINITY : Number(pageSize);
  if (!allowAll && (!Number.isFinite(normalizedPageSize) || normalizedPageSize < 1)) {
    throw new Error('Ungültige Seitengröße.');
  }

  const normalizedSearch = typeof search === 'string' ? search.trim().toLowerCase() : String(search ?? '').trim().toLowerCase();
  const normalizedFilters = sanitizeFilters(filters);

  try {
    let filtered = [...MOCK_ITEMS];
    if (normalizedSearch) {
      filtered = filtered.filter((item) => {
        const haystack = `${item.name} ${item.description}`.toLowerCase();
        return haystack.includes(normalizedSearch);
      });
    }

    if (normalizedFilters.type) {
      filtered = filtered.filter((item) => item.type === normalizedFilters.type);
    }

    if (normalizedFilters.material) {
      filtered = filtered.filter((item) => item.material === normalizedFilters.material);
    }

    if (normalizedFilters.rarity) {
      filtered = filtered.filter((item) => item.rarity === normalizedFilters.rarity);
    }

    const total = filtered.length;
    const safePageSize = allowAll ? filtered.length : Math.floor(normalizedPageSize);
    const start = allowAll ? 0 : Math.max(0, Math.floor((normalizedPage - 1) * safePageSize));
    const end = allowAll ? filtered.length : start + safePageSize;
    const items = filtered.slice(start, end);

    await delay(200);

    return {
      items,
      total,
      page: Math.floor(normalizedPage),
      pageSize: allowAll ? Number.POSITIVE_INFINITY : safePageSize,
    };
  } catch (error) {
    throw toError(error, 'Die Items konnten nicht geladen werden.');
  }
}

export async function loadItemById(id) {
  const rawId = id ?? '';
  const normalizedId = typeof rawId === 'string' ? rawId.trim() : String(rawId).trim();
  if (normalizedId.length === 0) {
    throw new Error('Eine Item-ID ist erforderlich.');
  }

  try {
    await delay(150);
    const item = MOCK_ITEMS.find((entry) => String(entry.id) === normalizedId || String(entry.id) === String(id));
    if (!item) {
      throw new Error('Item wurde nicht gefunden.');
    }
    return item;
  } catch (error) {
    throw toError(error, 'Item konnte nicht geladen werden.');
  }
}

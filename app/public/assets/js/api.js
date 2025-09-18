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

export async function getItems({ page = 1, pageSize = 6, search = '', filters = {} } = {}) {
  const normalizedSearch = search.trim().toLowerCase();

  let filtered = [...MOCK_ITEMS];
  if (normalizedSearch) {
    filtered = filtered.filter((item) => {
      const haystack = `${item.name} ${item.description}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }

  if (filters?.type) {
    filtered = filtered.filter((item) => item.type === filters.type);
  }

  if (filters?.material) {
    filtered = filtered.filter((item) => item.material === filters.material);
  }

  if (filters?.rarity) {
    filtered = filtered.filter((item) => item.rarity === filters.rarity);
  }

  const total = filtered.length;
  const start = Math.max(0, (page - 1) * pageSize);
  const end = start + pageSize;
  const items = filtered.slice(start, end);

  await delay(200);

  return {
    items,
    total,
    page,
    pageSize,
  };
}

export async function loadItemById(id) {
  await delay(150);
  const item = MOCK_ITEMS.find((entry) => String(entry.id) === String(id));
  if (!item) {
    throw new Error('Item wurde nicht gefunden.');
  }
  return item;
}

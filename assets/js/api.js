/**
 * Placeholder API layer that mimics asynchronous item retrieval.
 */

const MOCK_ITEMS = [
  {
    id: 'netherite_sword',
    name: 'Netherit-Schwert »Dämmerbrecher«',
    type: 'schwert',
    material: 'netherite',
    rarity: 'legendär',
    description:
      'Ein vollständig verzaubertes Schwert mit maximaler Haltbarkeit – ideal für Bosskämpfe und PvP.',
  },
  {
    id: 'diamond_pickaxe',
    name: 'Diamant-Spitzhacke »Samtpfote«',
    type: 'spitzhacke',
    material: 'diamond',
    rarity: 'episch',
    description:
      'Effizienz V, Glück III und Reparatur sorgen für schnelle Tunnel und reichlich Ressourcen.',
  },
  {
    id: 'elytra_glide',
    name: 'Elytra der Himmelsläufer',
    type: 'elytra',
    material: 'other',
    rarity: 'unbezahlbar',
    description:
      'Diese Elytra wurde von einem Endschiff geborgen und trägt eine feuerwerksoptimierte Haltbarkeit.',
  },
  {
    id: 'turtle_shell',
    name: 'Schildkrötenpanzer der Tiefe',
    type: 'schildkroetenpanzer',
    material: 'other',
    rarity: 'selten',
    description:
      'Schützt zuverlässig unter Wasser und liefert dank Atmungs-Verzauberung extra Sauerstoff.',
  },
  {
    id: 'netherite_chestplate',
    name: 'Netherit-Brustplatte »Festung«',
    type: 'brustplatte',
    material: 'netherite',
    rarity: 'mega_jackpot',
    description:
      'Maximal verstärkter Körperschutz inklusive Dornen III, Schutz IV und voller Reparatur-Unterstützung.',
  },
  {
    id: 'fishing_rod',
    name: 'Angel »Poseidons Laune«',
    type: 'angel',
    material: 'other',
    rarity: 'legendär',
    description:
      'Perfekte Fischerangel mit Glück des Meeres, Köder III und Treue-Optionen für garantierte Drops.',
  },
  {
    id: 'iron_shield',
    name: 'Verzierter Schild aus Eisenholz',
    type: 'schild',
    material: 'iron',
    rarity: 'selten',
    description:
      'Solider Schutzschild mit Bann und Haltbarkeit III – ideal für Nahkampfabenteuer.',
  },
  {
    id: 'golden_hoe',
    name: 'Vergoldete Hacke »Gaias Segen«',
    type: 'hacke',
    material: 'gold',
    rarity: 'episch',
    description:
      'Ermöglicht sofortiges Ernten dank Glück III und Haltbarkeit sowie automatischen Reparaturen.',
  },
];

function delay(value, ms = 250) {
  return new Promise((resolve) => {
    window.setTimeout(() => resolve(value), ms);
  });
}

function normalize(value) {
  return value?.toString().trim().toLowerCase() ?? '';
}

export async function getItems({ page = 1, pageSize = 6, search = '', filters = {} } = {}) {
  const normalizedSearch = normalize(search);
  const normalizedFilters = {
    type: normalize(filters.type),
    material: normalize(filters.material),
    rarity: normalize(filters.rarity),
  };

  const filtered = MOCK_ITEMS.filter((item) => {
    const matchesSearch = normalizedSearch
      ? item.name.toLowerCase().includes(normalizedSearch) ||
        item.description.toLowerCase().includes(normalizedSearch)
      : true;

    const matchesType = normalizedFilters.type
      ? item.type.toLowerCase() === normalizedFilters.type
      : true;

    const matchesMaterial = normalizedFilters.material
      ? item.material.toLowerCase() === normalizedFilters.material
      : true;

    const matchesRarity = normalizedFilters.rarity
      ? item.rarity.toLowerCase() === normalizedFilters.rarity
      : true;

    return matchesSearch && matchesType && matchesMaterial && matchesRarity;
  });

  const safePage = Math.max(1, Number.parseInt(page, 10) || 1);
  const safePageSize = Math.max(1, Number.parseInt(pageSize, 10) || 6);
  const start = (safePage - 1) * safePageSize;
  const end = start + safePageSize;

  const items = filtered.slice(start, end);
  const total = filtered.length;

  return delay({ items, total }, 320);
}

export async function loadItemById(id) {
  const normalizedId = id?.toString().trim();
  if (!normalizedId) {
    return delay(null, 120);
  }

  const item = MOCK_ITEMS.find((entry) => entry.id === normalizedId) ?? null;
  return delay(item, 160);
}

export function getMockItems() {
  return [...MOCK_ITEMS];
}

// assets/js/rarities.js
async function fetchRarities() {
  const res = await fetch('/api/rarities', { headers: { 'Accept': 'application/json' }});
  if (!res.ok) throw new Error('Failed to fetch /api/rarities');
  return res.json(); // [{id, slug, label, sort}]
}

function fillSelectWithRarities(selectEl, rarities, { keepFirstOption = false } = {}) {
  if (!selectEl) return;
  const first = keepFirstOption ? selectEl.querySelector('option[value=""]') : null;
  selectEl.innerHTML = '';
  if (first) selectEl.appendChild(first);
  for (const r of rarities) {
    const opt = document.createElement('option');
    opt.value = String(r.id);    // IDs als value
    opt.textContent = r.label;   // deutscher Labeltext
    selectEl.appendChild(opt);
  }
}

function toNumberOrNull(v) {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function initRarities() {
  try {
    const rarities = await fetchRarities();

    // Modal: Item hinzufügen
    fillSelectWithRarities(document.getElementById('item-rarity-select'), rarities);

    // Suche: Filter oben – behalte "Alle Seltenheiten"
    fillSelectWithRarities(document.getElementById('filter-rarity'), rarities, { keepFirstOption: true });

    // Safety: Form-Submit im Modal – stelle sicher, dass Zahlen gesendet werden
    const form = document.getElementById('item-form') || document.getElementById('addItemForm');
    if (form) {
      form.addEventListener('submit', (ev) => {
        // Dieser Listener darf NICHT den bestehenden Submit-Code ersetzen,
        // sondern nur sicherstellen, dass die Felder als Number vorliegen,
        // falls später aus FormData ein Payload gebaut wird.
        const raritySel   = document.getElementById('item-rarity-select');
        const typeSel     = document.getElementById('item-type-select');
        const materialSel = document.getElementById('item-material-select');
        // Schreibe die numeric values zurück in versteckte Inputs, falls benötigt
        // oder setze Datensätze, die vom vorhandenen Code gelesen werden.
        if (raritySel)   raritySel.dataset.numeric = String(toNumberOrNull(raritySel.value) ?? '');
        if (typeSel)     typeSel.dataset.numeric = String(toNumberOrNull(typeSel.value) ?? '');
        if (materialSel) materialSel.dataset.numeric = String(toNumberOrNull(materialSel.value) ?? '');
      }, { once: true }); // einmalig reicht
    }
  } catch (e) {
    console.error('[rarities] init failed:', e);
  }
}

document.addEventListener('DOMContentLoaded', initRarities);

// Drobné pomocné funkce sdílené ostatními skripty.

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// Normalizace pro porovnávání: bez diakritiky, malá písmena, jen písmena a čísla.
function norm(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function unique(list) {
  return [...new Set(list)];
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

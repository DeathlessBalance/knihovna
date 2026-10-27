// Hlavní logika aplikace: přihlášení, vykreslení knihovny, detail a formulář.

const TYPES = {
  kniha: { label: 'Knihy', one: 'Kniha', icon: '📚', where: 'v Knihách' },
  ekniha: { label: 'E-knihy', one: 'E-kniha', icon: '📱', where: 'v E-knihách' },
  wishlist: { label: 'Wishlist', one: 'Wishlist', icon: '⭐', where: 'na Wishlistu' },
};
const STATUSES = { neprecteno: 'Nepřečteno', ctu: 'Čtu', precteno: 'Přečteno' };
const EMPTY_MINE = {
  kniha: 'Tvoje polička je zatím prázdná.',
  ekniha: 'Zatím tu nemáš žádné e-knihy.',
  wishlist: 'Wishlist je prázdný – co by sis ráda přečetla?',
};
const CODE_KEY = 'knihovna.code';
const collator = new Intl.Collator('cs', { sensitivity: 'base', numeric: true });
const supportsPopover = typeof HTMLElement.prototype.showPopover === 'function';

const $ = (selector) => document.querySelector(selector);
const modal = $('#modal');
const modalBody = $('#modal-body');

let store = null;
let lookupResults = [];
let toastTimer = null;

const state = {
  me: null,
  viewing: null,
  tab: 'kniha',
  query: '',
  sort: 'added',
  genre: 'all',
  status: 'all',
  lentOnly: false,
  books: [],
  loaded: false,
  modal: null, // 'detail' | 'form' | null
  openId: null,
};

// ---------- Přihlášení ----------

function storageGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function storageSet(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}
function storageRemove(key) {
  try { localStorage.removeItem(key); } catch {}
}

function userByCode(code) {
  const c = String(code || '').trim().toLowerCase();
  return USERS.find((u) => u.code === c) || null;
}

function resolveUser() {
  const fromHash = decodeURIComponent(location.hash.slice(1));
  if (fromHash) {
    history.replaceState(null, '', location.pathname + location.search);
    const user = userByCode(fromHash);
    if (user) {
      storageSet(CODE_KEY, user.code);
      return user.name;
    }
  }
  return userByCode(storageGet(CODE_KEY))?.name ?? null;
}

function showLogin() {
  $('#login').hidden = false;
  // Osobní odkaz vložený do už otevřené stránky nezpůsobí její znovunačtení.
  window.addEventListener('hashchange', () => location.reload());
  $('#login-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const user = userByCode($('#login-code').value);
    if (!user) {
      $('#login-error').hidden = false;
      return;
    }
    storageSet(CODE_KEY, user.code);
    $('#login').hidden = true;
    start(user.name);
  });
}

async function start(me) {
  state.me = state.viewing = me;
  $('#app').hidden = false;
  fillFilters();
  bindEvents();
  renderAll();

  try {
    store = await createStore();
  } catch (err) {
    console.error(err);
    $('#list').innerHTML = '<p class="empty">Nepodařilo se připojit k databázi. Zkontroluj internet a obnov stránku.</p>';
    return;
  }
  $('#demo-banner').hidden = store.mode !== 'local';
  store.subscribe(
    (books) => {
      state.books = books;
      state.loaded = true;
      renderAll();
      if (state.modal === 'detail') renderDetail();
    },
    (err) => {
      console.error(err);
      toast('Chyba při načítání dat: ' + err.message);
    },
  );
}

// ---------- Pomocné výpočty ----------

function avgRating(book) {
  const values = Object.values(book.ratings || {}).filter(Boolean);
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}
const formatAvg = (v) => v.toLocaleString('cs-CZ', { maximumFractionDigits: 1 });
const starsText = (v) => '★'.repeat(Math.round(v)) + '☆'.repeat(5 - Math.round(v));
const listNames = (names) => esc(names.join(' a '));

function sameBook(a, b) {
  if (a.isbn && b.isbn && a.isbn === b.isbn) return true;
  const title = norm(a.title);
  if (!title || title !== norm(b.title)) return false;
  const authorA = norm(a.author);
  const authorB = norm(b.author);
  return !authorA || !authorB || authorA.includes(authorB) || authorB.includes(authorA);
}

// Kdo další má nebo chce stejný titul.
function relations(book) {
  const same = state.books.filter((x) => x.id !== book.id && x.owner !== book.owner && sameBook(x, book));
  return {
    ownedBy: unique(same.filter((x) => x.type !== 'wishlist').map((x) => x.owner)),
    wishedBy: unique(same.filter((x) => x.type === 'wishlist').map((x) => x.owner)),
  };
}

function relationTags(book) {
  const { ownedBy, wishedBy } = relations(book);
  const tags = [];
  if (book.type === 'wishlist') {
    if (ownedBy.includes(state.me)) tags.push('📚 Máš ji ty – můžeš půjčit');
    const others = ownedBy.filter((n) => n !== state.me);
    if (others.length) tags.push(`📚 Má ${listNames(others)}`);
  } else if (book.owner === state.me) {
    if (wishedBy.length) tags.push(`⭐ Chce ${listNames(wishedBy)}`);
  } else {
    if (wishedBy.includes(state.me)) tags.push('⭐ Máš na wishlistu');
    if (ownedBy.includes(state.me)) tags.push('Máš taky');
  }
  return tags;
}

function lentText(book) {
  if (!book.lentTo) return '';
  return book.lentTo === state.me && book.owner !== state.me
    ? `Půjčeno od ${esc(book.owner)}`
    : `Půjčeno: ${esc(book.lentTo)}`;
}

// ---------- Vykreslení hlavní stránky ----------

function fillFilters() {
  $('#genre-filter').innerHTML = ['<option value="all">Všechny žánry</option>', ...GENRES.map((g) => `<option>${esc(g)}</option>`)].join('');
  $('#status-filter').innerHTML = ['<option value="all">Jakýkoliv stav</option>', ...Object.entries(STATUSES).map(([k, l]) => `<option value="${k}">${l}</option>`)].join('');
}

function renderAll() {
  renderPeople();
  renderTabs();
  $('#status-filter').hidden = state.tab === 'wishlist';
  $('#lent-wrap').hidden = state.tab !== 'kniha';
  $('#add-btn').hidden = state.viewing !== state.me;
  renderList();
}

function renderPeople() {
  const order = [state.me, ...USERS.map((u) => u.name).filter((n) => n !== state.me)];
  $('#people').innerHTML = order
    .map((n) => `<button type="button" class="person ${n === state.viewing ? 'active' : ''}" data-person="${esc(n)}">${n === state.me ? 'Moje' : esc(n)}</button>`)
    .join('');
}

function renderTabs() {
  const theirs = state.books.filter((b) => b.owner === state.viewing);
  $('#tabs').innerHTML = Object.entries(TYPES)
    .map(([type, t]) => {
      const count = theirs.filter((b) => b.type === type).length;
      return `<button type="button" class="tab ${type === state.tab ? 'active' : ''}" data-tab="${type}"><span class="tab-icon">${t.icon}</span> ${t.label}<span class="count">${count}</span></button>`;
    })
    .join('');
}

function visibleBooks() {
  const q = norm(state.query);
  let list = state.books.filter((b) => b.owner === state.viewing && b.type === state.tab);
  if (q) list = list.filter((b) => norm([b.title, b.author, b.series].join(' ')).includes(q));
  if (state.genre !== 'all') list = list.filter((b) => b.genre === state.genre);
  if (state.tab !== 'wishlist' && state.status !== 'all') list = list.filter((b) => (b.status || 'neprecteno') === state.status);
  if (state.tab === 'kniha' && state.lentOnly) list = list.filter((b) => b.lentTo);
  return sortBooks(list);
}

function sortBooks(list) {
  const text = (v) => v || '';
  const comparators = {
    added: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    title: (a, b) => collator.compare(text(a.title), text(b.title)),
    author: (a, b) => collator.compare(text(a.author), text(b.author)) || collator.compare(text(a.title), text(b.title)),
    year: (a, b) => (b.year || 0) - (a.year || 0),
    rating: (a, b) => (avgRating(b) ?? -1) - (avgRating(a) ?? -1),
    series: (a, b) => collator.compare(text(a.series), text(b.series)) || (a.seriesNo || 0) - (b.seriesNo || 0),
  };
  return [...list].sort(comparators[state.sort]);
}

function groupBySeries(books) {
  const groups = new Map();
  for (const b of books) {
    const key = b.series?.trim() || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(b);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (!a ? 1 : !b ? -1 : collator.compare(a, b)))
    .map(([name, items]) => [name || 'Samostatné tituly', items]);
}

const grid = (books) => `<div class="grid">${books.map(card).join('')}</div>`;
const groupTitle = (title, count) => `<h2 class="group-title">${esc(title)}${count != null ? ` <span>${count}</span>` : ''}</h2>`;

function renderList() {
  const el = $('#list');
  if (!state.loaded) {
    el.innerHTML = '<p class="empty">Otevírám knihovnu…</p>';
    return;
  }
  const books = visibleBooks();
  let html = '';

  if (state.tab === 'kniha' && state.viewing === state.me && !state.query) {
    const borrowed = state.books.filter((b) => b.lentTo === state.me && b.owner !== state.me);
    if (borrowed.length) html += groupTitle('Mám půjčeno od ostatních', borrowed.length) + grid(borrowed) + groupTitle('Moje knihy');
  }

  if (!books.length) html += emptyState();
  else if (state.sort === 'series') html += groupBySeries(books).map(([name, items]) => groupTitle(name, items.length) + grid(items)).join('');
  else html += grid(books);

  el.innerHTML = html;
}

function emptyState() {
  const filtered = state.query || state.genre !== 'all'
    || (state.tab !== 'wishlist' && state.status !== 'all')
    || (state.tab === 'kniha' && state.lentOnly);
  if (filtered) return '<p class="empty">Filtru nic neodpovídá.</p>';
  if (state.viewing === state.me) {
    return `<div class="empty"><p class="empty-icon">❦</p><p>${EMPTY_MINE[state.tab]}</p><button type="button" class="btn btn-gold" data-add>+ Přidat titul</button></div>`;
  }
  return `<p class="empty">${esc(state.viewing)} tu zatím nic nemá.</p>`;
}

function coverHtml(book, className = 'cover') {
  return `<div class="${className}">
    <div class="ph"><span class="ph-title">${esc(book.title)}</span>${book.author ? `<span class="ph-author">${esc(book.author)}</span>` : ''}</div>
    ${book.cover ? `<img src="${esc(book.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
  </div>`;
}

function card(book) {
  const avg = avgRating(book);
  const badges = [];
  if (book.type !== 'wishlist') {
    const st = book.status || 'neprecteno';
    badges.push(`<span class="badge st-${st}">${STATUSES[st]}</span>`);
  }
  if (book.lentTo) badges.push(`<span class="badge lent">${lentText(book)}</span>`);
  for (const tag of relationTags(book)) badges.push(`<span class="badge match">${tag}</span>`);

  return `<article class="card" data-id="${esc(book.id)}" tabindex="0">
    ${coverHtml(book)}
    <div class="card-body">
      <h3 class="title">${esc(book.title)}</h3>
      ${book.author ? `<p class="author">${esc(book.author)}</p>` : ''}
      ${book.series ? `<p class="series">${esc(book.series)}${book.seriesNo ? ` · díl ${esc(book.seriesNo)}` : ''}</p>` : ''}
      <p class="meta">${[book.genre, book.year].filter(Boolean).map(esc).join(' · ')}</p>
      ${avg != null ? `<p class="stars-sm">${starsText(avg)} <span>${formatAvg(avg)}</span></p>` : ''}
      <div class="badges">${badges.join('')}</div>
    </div>
  </article>`;
}

// ---------- Detail titulu ----------

function openDetail(id) {
  state.modal = 'detail';
  state.openId = id;
  renderDetail();
  if (!modal.open) modal.showModal();
}

function renderDetail() {
  const book = state.books.find((b) => b.id === state.openId);
  if (!book) {
    if (modal.open) modal.close();
    return;
  }
  const own = book.owner === state.me;
  const facts = [
    ['Série', book.series ? esc(book.series) + (book.seriesNo ? `, díl ${esc(book.seriesNo)}` : '') : ''],
    ['Žánr', esc(book.genre)],
    ['Rok vydání', esc(book.year)],
    ['ISBN', esc(book.isbn)],
  ].filter(([, v]) => v);

  modalBody.innerHTML = `
    <button type="button" class="close" data-action="close" aria-label="Zavřít">×</button>
    <div class="detail">
      ${coverHtml(book, 'cover detail-cover')}
      <div>
        <p class="kicker">${TYPES[book.type].one} · ${own ? 'moje' : esc(book.owner)}</p>
        <h2>${esc(book.title)}</h2>
        ${book.author ? `<p class="author big">${esc(book.author)}</p>` : ''}
        ${facts.length ? `<dl class="facts">${facts.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>` : ''}
        ${relationTags(book).map((t) => `<p class="note">${t}</p>`).join('')}
      </div>
    </div>
    ${book.type !== 'wishlist' ? statusSection(book, own) + ratingSection(book) : ''}
    ${book.type === 'kniha' ? lendSection(book, own) : ''}
    ${own ? actionsSection(book) : ''}`;
}

function statusSection(book, own) {
  const st = book.status || 'neprecteno';
  const body = own
    ? `<div class="segmented">${Object.entries(STATUSES)
        .map(([k, l]) => `<button type="button" data-action="status" data-value="${k}" class="${k === st ? 'active' : ''}">${l}</button>`)
        .join('')}</div>`
    : `<span class="badge st-${st}">${STATUSES[st]}</span>`;
  return `<section class="section"><h3>Stav čtení</h3>${body}</section>`;
}

function ratingSection(book) {
  const avg = avgRating(book);
  const rows = USERS.map(({ name }) => {
    const value = book.ratings?.[name] || 0;
    const mine = name === state.me;
    const control = mine
      ? `<span class="star-input">${[1, 2, 3, 4, 5]
          .map((i) => `<button type="button" data-action="rate" data-value="${i}" class="${i <= value ? 'on' : ''}" aria-label="${i} z 5">★</button>`)
          .join('')}</span>`
      : value ? `<span class="stars">${starsText(value)}</span>` : '<em class="muted">zatím nehodnotila</em>';
    return `<div class="rating-row"><span>${mine ? 'Moje hodnocení' : esc(name)}</span>${control}</div>`;
  }).join('');
  const avgHtml = avg != null ? `<span class="avg">průměr ${formatAvg(avg)}</span>` : '';
  return `<section class="section"><h3>Hodnocení ${avgHtml}</h3>${rows}</section>`;
}

function lendSection(book, own) {
  let body;
  if (book.lentTo) {
    const since = book.lentSince ? ` od ${new Date(book.lentSince).toLocaleDateString('cs-CZ')}` : '';
    body = `<p>${lentText(book)}${since}</p>${own ? '<button type="button" class="btn" data-action="returned">Vráceno 🏠</button>' : ''}`;
  } else if (own) {
    const others = USERS.map((u) => u.name).filter((n) => n !== state.me);
    body = `<div class="lend-form">
      <select id="lend-to" aria-label="Komu">${others.map((n) => `<option>${esc(n)}</option>`).join('')}<option value="__other">Někomu jinému…</option></select>
      <input id="lend-other" placeholder="Jméno" hidden>
      <button type="button" class="btn btn-red" data-action="lend">Půjčit</button>
    </div>`;
  } else {
    body = '<p class="muted">Kniha je k dispozici – stačí si o ni říct.</p>';
  }
  return `<section class="section"><h3>Půjčování</h3>${body}</section>`;
}

function actionsSection(book) {
  const bought = book.type === 'wishlist'
    ? `<button type="button" class="btn btn-gold" data-action="bought" data-value="kniha">📚 Koupeno jako kniha</button>
       <button type="button" class="btn btn-gold" data-action="bought" data-value="ekniha">📱 Koupeno jako e-kniha</button>`
    : '';
  return `<div class="actions">${bought}
    <button type="button" class="btn" data-action="edit">Upravit</button>
    <button type="button" class="btn btn-danger" data-action="delete">Smazat</button>
  </div>`;
}

// ---------- Formulář přidání / úpravy ----------

function field(label, control, className = '') {
  return `<label class="field ${className}"><span>${label}</span>${control}</label>`;
}

function select(name, options, current) {
  return `<select name="${name}">${Object.entries(options)
    .map(([v, l]) => `<option value="${esc(v)}"${v === String(current ?? '') ? ' selected' : ''}>${esc(l)}</option>`)
    .join('')}</select>`;
}

function openForm(book = null) {
  const b = book || { type: state.tab, status: 'neprecteno' };
  state.modal = 'form';
  state.openId = book?.id ?? null;
  lookupResults = [];

  const typeOptions = Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, t.label]));
  const genreOptions = { '': '— vyber —', ...Object.fromEntries(GENRES.map((g) => [g, g])) };

  modalBody.innerHTML = `
    <button type="button" class="close" data-action="close" aria-label="Zavřít">×</button>
    <h2>${book ? 'Upravit titul' : 'Přidat titul'}</h2>
    <div class="lookup">
      <label for="lookup-q">Vyhledat a vyplnit automaticky</label>
      <div class="lookup-row">
        <input id="lookup-q" type="search" placeholder="Název nebo ISBN" enterkeyhint="search">
        <button type="button" class="btn btn-red" data-action="lookup">Hledat</button>
      </div>
      <div id="lookup-results" class="lookup-results"></div>
    </div>
    <form id="book-form" class="book-form" autocomplete="off">
      <div id="cover-preview" class="cover-preview"></div>
      <input type="hidden" name="cover" value="${esc(b.cover)}">
      <input type="hidden" name="isbn" value="${esc(b.isbn)}">
      ${field('Název *', `<input name="title" required value="${esc(b.title)}">`, 'full')}
      ${field('Autor', `<input name="author" value="${esc(b.author)}">`, 'full')}
      ${field('Záložka', select('type', typeOptions, b.type))}
      ${field('Žánr', select('genre', genreOptions, b.genre))}
      ${field('Série', `<input name="series" value="${esc(b.series)}" placeholder="např. Zaklínač">`)}
      ${field('Díl', `<input name="seriesNo" type="number" min="0" step="1" inputmode="numeric" value="${esc(b.seriesNo)}">`)}
      ${field('Rok vydání', `<input name="year" type="number" min="0" max="2100" inputmode="numeric" value="${esc(b.year)}">`)}
      ${field('Stav čtení', select('status', STATUSES, b.status || 'neprecteno'), 'status-field')}
      <div id="dup-warning" class="warning" hidden></div>
      <div class="form-actions">
        <button type="button" class="btn ghost" data-action="close">Zrušit</button>
        <button type="submit" class="btn btn-gold">Uložit</button>
      </div>
    </form>`;
  renderCoverPreview();
  syncFormState();
  if (!modal.open) modal.showModal();
}

const formEl = (name) => modalBody.querySelector('#book-form')?.elements.namedItem(name);

function formData() {
  const get = (n) => formEl(n).value.trim();
  const num = (n) => {
    const v = parseInt(get(n), 10);
    return Number.isFinite(v) ? v : null;
  };
  return {
    title: get('title'),
    author: get('author'),
    type: get('type'),
    genre: get('genre') || null,
    series: get('series') || null,
    seriesNo: num('seriesNo'),
    year: num('year'),
    status: get('status'),
    cover: get('cover') || null,
    isbn: get('isbn') || null,
  };
}

function syncFormState() {
  const form = modalBody.querySelector('#book-form');
  if (!form) return;
  const data = formData();
  form.querySelector('.status-field').hidden = data.type === 'wishlist';
  const msg = duplicateMessage(data, state.openId);
  const warning = form.querySelector('#dup-warning');
  warning.hidden = !msg;
  warning.innerHTML = msg;
}

function duplicateMessage(data, editingId) {
  if (!data.title) return '';
  const same = state.books.filter((x) => x.id !== editingId && sameBook(x, data));
  const msgs = [];
  const mine = unique(same.filter((x) => x.owner === state.me).map((x) => TYPES[x.type].where));
  if (mine.length) msgs.push(`Tenhle titul už máš ${mine.join(' a ')}.`);
  if (data.type === 'wishlist') {
    const owners = unique(same.filter((x) => x.owner !== state.me && x.type !== 'wishlist').map((x) => x.owner));
    if (owners.length) msgs.push(`📚 ${listNames(owners)} už tuhle knihu má – můžeš si ji půjčit 😉`);
  }
  return msgs.join('<br>');
}

function setCover(url) {
  formEl('cover').value = url || '';
  renderCoverPreview();
}

function renderCoverPreview() {
  const box = modalBody.querySelector('#cover-preview');
  const url = formEl('cover').value;
  box.hidden = !url;
  box.innerHTML = url
    ? `<img src="${esc(url)}" alt="Obálka" referrerpolicy="no-referrer"><button type="button" class="btn ghost" data-action="remove-cover">Odebrat obálku</button>`
    : '';
}

async function runLookup() {
  const input = modalBody.querySelector('#lookup-q');
  const box = modalBody.querySelector('#lookup-results');
  const q = input.value.trim() || formEl('title').value.trim();
  if (!q) {
    input.focus();
    return;
  }
  box.innerHTML = '<p class="muted">Hledám…</p>';
  try {
    lookupResults = await searchBooks(q);
  } catch (err) {
    if (box.isConnected) box.innerHTML = `<p class="muted">${esc(err.message)}</p>`;
    return;
  }
  if (!box.isConnected) return;
  box.innerHTML = lookupResults.length
    ? lookupResults
        .map((r, i) => `<button type="button" class="result" data-action="pick" data-value="${i}">
          ${r.cover ? `<img src="${esc(r.cover)}" alt="" referrerpolicy="no-referrer">` : '<span class="noimg"></span>'}
          <span><strong>${esc(r.title)}</strong><small>${esc([r.author, r.year].filter(Boolean).join(' · '))}</small></span>
        </button>`)
        .join('')
    : '<p class="muted">Nic nenalezeno – zkus jiný název, nebo vyplň údaje ručně.</p>';
}

function pickResult(index) {
  const r = lookupResults[index];
  if (!r) return;
  formEl('title').value = r.title;
  formEl('author').value = r.author || '';
  if (r.year) formEl('year').value = r.year;
  if (r.isbn) formEl('isbn').value = r.isbn;
  if (r.genre && !formEl('genre').value) formEl('genre').value = r.genre;
  if (r.cover) setCover(r.cover);
  modalBody.querySelector('#lookup-results').innerHTML = '<p class="muted">✓ Vyplněno – zkontroluj údaje a doplň sérii nebo žánr.</p>';
  syncFormState();
}

async function onFormSubmit(e) {
  if (e.target.id !== 'book-form') return;
  e.preventDefault();
  const data = formData();
  if (!data.title) {
    toast('Vyplň název');
    return;
  }
  const editingId = state.openId;
  const button = e.target.querySelector('[type=submit]');
  button.disabled = true;
  try {
    if (editingId) await store.update(editingId, data);
    else await store.add({ ...data, owner: state.me, ratings: {}, lentTo: null, lentSince: null });
    state.viewing = state.me;
    state.tab = data.type;
    modal.close();
    renderAll();
    toast(editingId ? 'Uloženo' : `Přidáno: ${data.title}`);
  } catch (err) {
    console.error(err);
    button.disabled = false;
    toast('Uložení se nepovedlo: ' + err.message);
  }
}

// ---------- Události ----------

async function onModalClick(e) {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const { action, value } = el.dataset;
  const book = state.books.find((b) => b.id === state.openId);
  try {
    switch (action) {
      case 'close':
        modal.close();
        break;
      case 'lookup':
        await runLookup();
        break;
      case 'pick':
        pickResult(Number(value));
        break;
      case 'remove-cover':
        setCover(null);
        break;
      case 'edit':
        openForm(book);
        break;
      case 'delete':
        if (confirm(`Opravdu smazat „${book.title}“?`)) {
          await store.remove(book.id);
          modal.close();
          toast('Smazáno');
        }
        break;
      case 'status':
        await store.update(book.id, { status: value });
        break;
      case 'rate': {
        const stars = Number(value);
        await store.setRating(book.id, state.me, book.ratings?.[state.me] === stars ? null : stars);
        break;
      }
      case 'lend': {
        const to = modalBody.querySelector('#lend-to').value;
        const name = to === '__other' ? modalBody.querySelector('#lend-other').value.trim() : to;
        if (!name) {
          toast('Napiš, komu knihu půjčuješ');
          return;
        }
        await store.update(book.id, { lentTo: name, lentSince: Date.now() });
        toast(`Půjčeno: ${name}`);
        break;
      }
      case 'returned':
        await store.update(book.id, { lentTo: null, lentSince: null });
        toast('Kniha je zpátky doma 🏠');
        break;
      case 'bought':
        await store.update(book.id, { type: value, status: 'neprecteno' });
        state.tab = value;
        modal.close();
        renderAll();
        toast(`Hurá! Přesunuto do záložky ${TYPES[value].label}`);
        break;
    }
  } catch (err) {
    console.error(err);
    toast('Něco se nepovedlo: ' + err.message);
  }
}

function onModalInput(e) {
  if (e.target.id === 'lend-to') {
    modalBody.querySelector('#lend-other').hidden = e.target.value !== '__other';
    return;
  }
  if (e.target.closest('#book-form')) syncFormState();
}

function bindEvents() {
  $('#people').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-person]');
    if (!btn) return;
    state.viewing = btn.dataset.person;
    renderAll();
  });
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    renderAll();
  });
  $('#search').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; renderList(); });
  $('#genre-filter').addEventListener('change', (e) => { state.genre = e.target.value; renderList(); });
  $('#status-filter').addEventListener('change', (e) => { state.status = e.target.value; renderList(); });
  $('#lent-only').addEventListener('change', (e) => { state.lentOnly = e.target.checked; renderList(); });

  $('#list').addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) return openForm();
    const el = e.target.closest('.card');
    if (el) openDetail(el.dataset.id);
  });
  $('#list').addEventListener('keydown', (e) => {
    const el = e.target.closest('.card');
    if (el && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openDetail(el.dataset.id);
    }
  });
  $('#add-btn').addEventListener('click', () => openForm());
  $('#logout').addEventListener('click', () => {
    if (!confirm('Odhlásit se na tomto zařízení?')) return;
    storageRemove(CODE_KEY);
    location.reload();
  });

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.close();
  });
  modal.addEventListener('close', () => {
    if (modal.open) return; // mezitím se otevřelo znovu
    state.modal = null;
    state.openId = null;
    modalBody.innerHTML = '';
  });
  modalBody.addEventListener('click', onModalClick);
  modalBody.addEventListener('submit', onFormSubmit);
  modalBody.addEventListener('input', onModalInput);
  modalBody.addEventListener('change', onModalInput);
  modalBody.addEventListener('keydown', (e) => {
    if (e.target.id === 'lookup-q' && e.key === 'Enter') {
      e.preventDefault();
      runLookup();
    }
  });
}

function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  if (supportsPopover && !el.matches(':popover-open')) el.showPopover();
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (supportsPopover) el.hidePopover();
    el.hidden = true;
  }, 2600);
}

// ---------- Start ----------

const currentUser = resolveUser();
if (currentUser) start(currentUser);
else showLogin();

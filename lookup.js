// Vyhledávání knih pro automatické vyplnění (Google Books + Open Library, obojí zdarma bez klíče).

const GOOGLE_BOOKS_URL = 'https://www.googleapis.com/books/v1/volumes';
const OPEN_LIBRARY_URL = 'https://openlibrary.org/search.json';

// Odhad žánru z anglických kategorií. Pořadí rozhoduje – první shoda vyhrává.
const GENRE_HINTS = [
  ['Komiks/Manga', /comic|manga|graphic novel/i],
  ['Poezie', /poetry|poems/i],
  ['Horor', /horror/i],
  ['Erotický román', /erotic/i],
  ['Romantasy', /romantasy|fantasy romance|romance \/ fantasy|romantic fantasy|paranormal romance/i],
  ['Sci-fi', /science fiction|sci-fi|dystopi/i],
  ['Fantasy', /fantasy|magic|dragons/i],
  ['Romantika', /romance|love stor/i],
  ['Thriller', /thriller|suspense/i],
  ['Detektivka', /detective|mystery|crime/i],
  ['Historický', /historical fiction/i],
  ['Životopis', /biograph|autobiograph|memoir/i],
  ['Young adult', /young adult/i],
  ['Dětská', /juvenile|children/i],
  ['Klasika', /classic/i],
  ['Literatura faktu', /history|science|psychology|self-help|philosophy|nonfiction/i],
];

function guessGenre(categories) {
  const text = categories.join(' | ');
  return GENRE_HINTS.find(([, re]) => re.test(text))?.[0] ?? null;
}

function cleanIsbn(value) {
  return String(value || '').replace(/[^\dXx]/g, '').toUpperCase();
}

function looksLikeIsbn(query) {
  return /^[\d\s-]{9,}[\dXx]?$/.test(query.trim()) && [10, 13].includes(cleanIsbn(query).length);
}

function pickIsbn(list) {
  const isbns = list.map(cleanIsbn);
  return isbns.find((x) => x.length === 13) || isbns.find((x) => x.length === 10) || null;
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function searchGoogleBooks(query, isbn) {
  const q = isbn ? `isbn:${isbn}` : query;
  const key = GOOGLE_BOOKS_API_KEY ? `&key=${encodeURIComponent(GOOGLE_BOOKS_API_KEY)}` : '';
  const data = await fetchJson(`${GOOGLE_BOOKS_URL}?q=${encodeURIComponent(q)}&maxResults=10&printType=books${key}`);
  return (data.items || [])
    .map(({ volumeInfo: v = {} }) => {
      const cover = v.imageLinks?.thumbnail || v.imageLinks?.smallThumbnail;
      const ids = (v.industryIdentifiers || []).filter((i) => i.type.startsWith('ISBN')).map((i) => i.identifier);
      return {
        title: v.title,
        author: (v.authors || []).join(', '),
        year: parseInt(v.publishedDate, 10) || null,
        cover: cover ? cover.replace(/^http:/, 'https:').replace('&edge=curl', '') : null,
        isbn: isbn || pickIsbn(ids),
        genre: guessGenre(v.categories || []),
      };
    })
    .filter((r) => r.title);
}

async function searchOpenLibrary(query, isbn) {
  const params = new URLSearchParams({
    limit: '10',
    fields: 'title,author_name,first_publish_year,isbn,cover_i,subject',
  });
  params.set(isbn ? 'isbn' : 'q', isbn || query);
  const data = await fetchJson(`${OPEN_LIBRARY_URL}?${params}`);
  return (data.docs || [])
    .map((d) => ({
      title: d.title,
      author: (d.author_name || []).slice(0, 2).join(', '),
      year: d.first_publish_year || null,
      cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-M.jpg` : null,
      isbn: isbn || pickIsbn(d.isbn || []),
      genre: guessGenre((d.subject || []).slice(0, 40)),
    }))
    .filter((r) => r.title);
}

async function searchBooks(query) {
  const q = query.trim();
  if (!q) return [];
  const isbn = looksLikeIsbn(q) ? cleanIsbn(q) : null;
  const [google, openLibrary] = await Promise.allSettled([searchGoogleBooks(q, isbn), searchOpenLibrary(q, isbn)]);
  if (google.status === 'rejected' && openLibrary.status === 'rejected') {
    throw new Error('Vyhledávání teď nefunguje, zkus to za chvíli nebo vyplň údaje ručně.');
  }

  // Sloučení výsledků: stejný název + autor = jeden záznam, chybějící údaje se doplní.
  const merged = new Map();
  for (const r of [...(google.value || []), ...(openLibrary.value || [])]) {
    const key = `${norm(r.title)}|${norm(r.author)}`;
    const existing = merged.get(key);
    if (!existing) merged.set(key, r);
    else for (const field of ['cover', 'year', 'isbn', 'genre']) existing[field] ??= r[field];
  }
  return [...merged.values()].slice(0, 12);
}

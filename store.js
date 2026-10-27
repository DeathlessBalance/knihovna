// Datová vrstva. Stejné rozhraní pro zkušební režim (localStorage) i pro Firebase:
//   subscribe(onBooks, onError) – volá onBooks(pole knih) při každé změně
//   add(book), update(id, patch), remove(id), setRating(id, user, stars | null)

const FIREBASE_VERSION = '10.12.2';

async function createStore() {
  return FIREBASE_CONFIG ? createFirebaseStore(FIREBASE_CONFIG) : createLocalStore();
}

function createLocalStore() {
  const KEY = 'knihovna.books';
  const listeners = new Set();

  const read = () => {
    try {
      return JSON.parse(localStorage.getItem(KEY)) || [];
    } catch {
      return [];
    }
  };
  const emit = () => {
    const books = read();
    listeners.forEach((cb) => cb(books));
  };
  const write = (books) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(books));
    } catch {
      throw new Error('Prohlížeč nedovolil uložit data.');
    }
    emit();
  };
  const patchBook = (id, fn) => write(read().map((b) => (b.id === id ? fn(b) : b)));

  try {
    if (localStorage.getItem(KEY) === null) localStorage.setItem(KEY, JSON.stringify(sampleBooks()));
  } catch {}
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) emit();
  });

  return {
    mode: 'local',
    subscribe(onBooks) {
      listeners.add(onBooks);
      onBooks(read());
      return () => listeners.delete(onBooks);
    },
    async add(book) {
      const now = Date.now();
      const id = makeId();
      write([...read(), { ...book, id, createdAt: now, updatedAt: now }]);
      return id;
    },
    async update(id, patch) {
      patchBook(id, (b) => ({ ...b, ...patch, updatedAt: Date.now() }));
    },
    async remove(id) {
      write(read().filter((b) => b.id !== id));
    },
    async setRating(id, user, stars) {
      patchBook(id, (b) => {
        const ratings = { ...(b.ratings || {}) };
        if (stars) ratings[user] = stars;
        else delete ratings[user];
        return { ...b, ratings };
      });
    },
  };
}

async function createFirebaseStore(config) {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}`;
  const { initializeApp } = await import(`${base}/firebase-app.js`);
  const fs = await import(`${base}/firebase-firestore.js`);
  const db = fs.getFirestore(initializeApp(config));
  const books = fs.collection(db, 'books');
  const ref = (id) => fs.doc(db, 'books', id);

  return {
    mode: 'firebase',
    subscribe(onBooks, onError) {
      return fs.onSnapshot(
        books,
        (snap) => onBooks(snap.docs.map((d) => ({ ...d.data(), id: d.id }))),
        onError,
      );
    },
    async add(book) {
      const now = Date.now();
      const docRef = await fs.addDoc(books, { ...book, createdAt: now, updatedAt: now });
      return docRef.id;
    },
    update(id, patch) {
      return fs.updateDoc(ref(id), { ...patch, updatedAt: Date.now() });
    },
    remove(id) {
      return fs.deleteDoc(ref(id));
    },
    setRating(id, user, stars) {
      return fs.updateDoc(ref(id), { [`ratings.${user}`]: stars || fs.deleteField() });
    },
  };
}

// Ukázková data jen pro zkušební režim, ať je hned co prohlížet.
function sampleBooks() {
  const [a, b] = USERS.map((u) => u.name);
  const day = 86400000;
  const now = Date.now();
  const book = (owner, type, data, age) => ({
    id: makeId(),
    owner,
    type,
    author: '',
    genre: null,
    series: null,
    seriesNo: null,
    year: null,
    isbn: null,
    cover: null,
    status: 'neprecteno',
    ratings: {},
    lentTo: null,
    lentSince: null,
    createdAt: now - age * day,
    updatedAt: now - age * day,
    ...data,
  });
  return [
    book(a, 'kniha', { title: 'Zaklínač: Poslední přání', author: 'Andrzej Sapkowski', genre: 'Fantasy', series: 'Zaklínač', seriesNo: 1, year: 1993, status: 'precteno', ratings: { [a]: 5, [b]: 4 } }, 9),
    book(a, 'kniha', { title: 'Meč osudu', author: 'Andrzej Sapkowski', genre: 'Fantasy', series: 'Zaklínač', seriesNo: 2, year: 1992, status: 'ctu' }, 5),
    book(a, 'ekniha', { title: 'Pýcha a předsudek', author: 'Jane Austen', genre: 'Klasika', year: 1813, status: 'precteno', ratings: { [a]: 4 } }, 7),
    book(a, 'wishlist', { title: 'Čtvrté křídlo', author: 'Rebecca Yarros', genre: 'Fantasy', series: 'Empyreum', seriesNo: 1, year: 2023 }, 2),
    book(b, 'kniha', { title: 'Čtvrté křídlo', author: 'Rebecca Yarros', genre: 'Fantasy', series: 'Empyreum', seriesNo: 1, year: 2023, status: 'precteno', ratings: { [b]: 5 } }, 8),
    book(b, 'kniha', { title: 'Vražda v Orient expresu', author: 'Agatha Christie', genre: 'Detektivka', year: 1934, lentTo: a, lentSince: now - 3 * day }, 6),
    book(b, 'ekniha', { title: 'Duna', author: 'Frank Herbert', genre: 'Sci-fi', series: 'Duna', seriesNo: 1, year: 1965, status: 'ctu' }, 4),
    book(b, 'wishlist', { title: 'Dvůr trnů a růží', author: 'Sarah J. Maas', genre: 'Fantasy', series: 'Dvůr trnů a růží', seriesNo: 1, year: 2015 }, 1),
  ];
}

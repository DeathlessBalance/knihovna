// Nastavení aplikace – tady se mění uživatelky, žánry a připojení k databázi.

// Každá uživatelka má svůj osobní kód. Otevře odkaz .../index.html#KOD
// a prohlížeč si ji zapamatuje. Kódy můžeš klidně změnit (jen malá písmena, bez mezer).
const USERS = [
  { name: 'Veyra', code: 'veyra-k7m2q9' },
  { name: 'Nyx', code: 'nyx-p4w8z3' },
];

const GENRES = [
  'Fantasy',
  'Sci-fi',
  'Romantika',
  'Detektivka',
  'Thriller',
  'Horor',
  'Historický',
  'Young adult',
  'Klasika',
  'Literatura faktu',
  'Životopis',
  'Poezie',
  'Komiks/Manga',
  'Dětská',
  'Jiné',
];

// Klíč pro Google Books (zdarma, viz NAVOD.md). Bez něj vyhledávání často hlásí
// vyčerpaný limit a české knihy pak hledá jen Open Library, která jich moc nezná.
const GOOGLE_BOOKS_API_KEY = '';

// Dokud je tu null, běží aplikace ve zkušebním režimu (data jen v tomto prohlížeči).
// Po založení projektu ve Firebase sem vlož jeho konfiguraci (viz NAVOD.md), např.:
// const FIREBASE_CONFIG = {
//   apiKey: '...',
//   authDomain: '....firebaseapp.com',
//   projectId: '...',
//   storageBucket: '....appspot.com',
//   messagingSenderId: '...',
//   appId: '...',
// };
const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCNv5RqwpRmC6vMSw2HQGT7RqaHeVpc4aE',
  authDomain: 'snova-knihovna-dc2f6.firebaseapp.com',
  projectId: 'snova-knihovna-dc2f6',
  storageBucket: 'snova-knihovna-dc2f6.firebasestorage.app',
  messagingSenderId: '710791908255',
  appId: '1:710791908255:web:ce0d348f625448fb168baa',
};

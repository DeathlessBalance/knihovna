# Knihovna – návod na zprovoznění

Aplikace běží v prohlížeči na PC i mobilu. Data se ukládají do bezplatné databáze Firebase,
stránka je zdarma na GitHub Pages.

## 0. Vyzkoušení na počítači

Dvojklikem otevři `index.html` v prohlížeči a zadej kód, třeba `veyra-k7m2q9`.

Dokud v `config.js` není vyplněné `FIREBASE_CONFIG`, běží aplikace ve **zkušebním režimu**:
data se ukládají jen v daném prohlížeči a jsou tam ukázkové knihy.
Ukázky se po připojení Firebase nezobrazí.

## 1. Firebase (databáze) – asi 5 minut

1. Otevři <https://console.firebase.google.com> a přihlas se Google účtem.
2. **Vytvořit projekt** (Create a project), třeba s názvem `knihovna`. Google Analytics můžeš vypnout.
3. V levém menu **Build → Firestore Database → Create database**.
   - Lokaci zvol `eur3 (Europe)`.
   - Režim: **Production mode**.
4. Na záložce **Rules** smaž obsah, vlož celý soubor `firestore.rules` a klikni na **Publish**.
5. Vrať se na přehled projektu (ikona ozubeného kola → **Project settings**).
   Dole v části *Your apps* klikni na ikonu **`</>`** (Web), zadej název `knihovna`
   a klikni na **Register app**. Firebase Hosting nezaškrtávej.
6. Zobrazí se blok `const firebaseConfig = { ... }`. Zkopíruj obsah složených závorek
   do `config.js` místo `null`:

   ```js
   const FIREBASE_CONFIG = {
     apiKey: 'AIza...',
     authDomain: 'knihovna-xxxx.firebaseapp.com',
     projectId: 'knihovna-xxxx',
     storageBucket: 'knihovna-xxxx.appspot.com',
     messagingSenderId: '123...',
     appId: '1:123...:web:abc...',
   };
   ```

## 2. Klíč pro vyhledávání knih (Google Books) – asi 3 minuty

Bez klíče vyhledávání často hlásí vyčerpaný limit a české knihy pak skoro nenajde.

1. Otevři <https://console.cloud.google.com> a nahoře vyber projekt `knihovna` (ten z Firebase).
2. **APIs & Services → Library**, vyhledej **Books API** a klikni na **Enable**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. U klíče klikni na **Edit** a v části *API restrictions* zvol **Restrict key → Books API**.
   Volitelně v části *Website restrictions* povol jen `https://TVOJE-JMENO.github.io/*`.
5. Klíč vlož do `config.js`: `const GOOGLE_BOOKS_API_KEY = 'AIza...';`

## 3. GitHub Pages (zveřejnění stránky) – asi 3 minuty

1. Na <https://github.com/new> vytvoř repozitář, třeba `knihovna` (Public).
2. Na stránce repozitáře klikni na **uploading an existing file** a přetáhni tam
   všechny soubory ze složky (kromě složky `.claude`). Klikni na **Commit changes**.
3. **Settings → Pages**: *Source* = **Deploy from a branch**, *Branch* = `main` a `/ (root)`, potom **Save**.
4. Asi za minutu poběží aplikace na `https://TVOJE-JMENO.github.io/knihovna/`.

## 4. Pošli holkám odkazy

Každá dostane svůj osobní odkaz (kódy jsou v `config.js`):

- Veyra: `https://TVOJE-JMENO.github.io/knihovna/#veyra-k7m2q9`
- Nyx: `https://TVOJE-JMENO.github.io/knihovna/#nyx-p4w8z3`

Odkaz stačí otevřít jednou, prohlížeč si přihlášení zapamatuje.

**Na mobil jako aplikace:**

- Android (Chrome): menu ⋮ → **Přidat na plochu** / **Instalovat aplikaci**.
- iPhone (Safari): tlačítko Sdílet → **Přidat na plochu**.

## Úpravy

- **Přidat kamarádku:** do `USERS` v `config.js` přidej řádek `{ name: 'Jméno', code: 'jmeno-nejakykod' }`.
  Stejné jméno doplň do `firestore.rules` (do obou seznamů) a pravidla znovu publikuj.
- **Žánry:** seznam `GENRES` v `config.js`.
- Po změně souborů je znovu nahraj na GitHub (přetažením; stávající se přepíšou).

## Bezpečnost (stručně)

Ochrana je jednoduchá, jak bylo domluvené: kdo zná adresu aplikace a nahlédne do jejího kódu,
může data číst i měnit. Pro sdílení seznamu knih to stačí. Nedávej do aplikace nic citlivého.

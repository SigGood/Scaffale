# Scaffale — regole per chi lavora sul codice

Questo file lo legge qualsiasi Claude (o persona) prima di modificare la repo.
Ci lavorano due persone che non sono sviluppatori, ognuna con il proprio Claude:
- **Andrea** (SigGood) — autore e proprietario dell'app, decide cosa entra.
- **Mirko** (fratello di Andrea) — collaboratore, segnala problemi e propone modifiche.

Le persone parlano italiano e non conoscono git: spiega sempre cosa fai in parole semplici, senza dare per scontati termini tecnici.

## Cos'è l'app

PWA in JavaScript puro, senza framework né build: i file nella repo sono esattamente quelli che vengono serviti.

| File | Contenuto |
|---|---|
| `index.html` | guscio della pagina e barra delle sezioni |
| `app.js` | quasi tutta l'app: dati, viste (Diario, Cerca, Da fare, Liste, Profilo), ricerca |
| `cloud.js` | account, sincronizzazione e amici (Firebase Auth + Firestore) |
| `import.js` | importazione da Letterboxd e Goodreads, ricerca copertine in background |
| `sw.js` | service worker: funzionamento offline e cache |
| `style.css` | stile |
| `config.txt` | indirizzo del ponte Cloudflare e configurazione Firebase |
| `manifest.webmanifest`, icone | installazione sul telefono |

- **Dati:** sul dispositivo (IndexedDB, con localStorage come riserva); se l'utente ha un account, sincronizzati su Firestore.
- **Ricerca:** libri su Google Books e Open Library direttamente dall'app; giochi (IGDB) e film (TMDB) tramite il **ponte**, un Cloudflare Worker (`scaffale-ponte`, https://scaffale-ponte.a-buono92.workers.dev). Il codice del ponte **non è in questa repo**: vive nella dashboard Cloudflare di Andrea. Le chiavi di IGDB e TMDB stanno solo nel worker: non vanno mai messe nella repo (che è pubblica).
- **Pubblicazione:** GitHub Pages pubblica il ramo `main` su https://siggood.github.io/Scaffale/ (la S maiuscola conta). Dopo un merge servono circa 10 minuti (cache di GitHub Pages); poi sul telefono bisogna chiudere e riaprire l'app due volte per vedere la versione nuova.

## Firebase (progetto `scaffale-81f57`)

Firestore + login email/password. I dati di ogni utente sono divisi a blocchi:

- `users/{uid}/w/0..31` e `users/{uid}/e/0..31` — le opere e le voci del diario, divise in 32 blocchi
- `users/{uid}/meta/main` — liste e preferiti (visibili agli amici)
- `users/{uid}/private/settings` — impostazioni private
- `users/{uid}/followers/{uid amico}` — amici collegati
- `codes/{code}` — codici amico

Le **regole di sicurezza di Firestore** non stanno nella repo: si modificano a mano dalla console Firebase. Se una modifica cambia questi percorsi o ne aggiunge di nuovi, va detto chiaramente nella PR, perché senza aggiornare le regole la sincronizzazione smette di funzionare.

## Come si lavora

1. **Ogni lavoro parte da una issue** su GitHub (problema o proposta). Se non c'è, prima si apre.
2. **Prima di iniziare:** controlla le PR aperte. Se un'altra PR tocca la stessa parte di codice, fermati e segnalalo: due modifiche parallele sugli stessi punti di `app.js` creano conflitti che nessuno dei due sa risolvere.
3. **Assegna la issue** a chi ci sta lavorando, così l'altro sa che è occupata.
4. **Mai modifiche dirette su `main`.** Sempre un branch con nome parlante (es. `cache-copertine`) partendo dall'ultima versione di `main`, e una pull request.
5. **Una PR per problema.** Piccola, così si può accettare o rifiutare da sola.
6. **Descrizione della PR in italiano semplice:** cosa cambia per chi usa l'app, come provarlo sul telefono dopo il merge, eventuali rischi (in particolare: serve aggiornare le regole Firebase?). Nel testo scrivi `Risolve #N` per chiudere la issue in automatico.
7. **Il merge lo fa Andrea.** Nessun Claude unisce PR da solo.
8. **Niente caricamenti a mano** ("Upload files" dal sito di GitHub): con le PR non servono e rischiano di cancellare le modifiche già unite. Solo come ultima risorsa, se l'accesso dei Claude alla repo non funziona, e sempre partendo dai file appena riscaricati da GitHub.

## Come si prova

GitHub Pages pubblica solo `main`, quindi una modifica **non si può provare sul telefono prima del merge**.
- **Prima del merge:** il Claude che propone la modifica la prova in automatico (per esempio con Playwright, simulando Firebase e il ponte) e scrive nella PR cosa ha verificato.
- **Dopo il merge:** Andrea e Mirko la provano sul telefono. Se qualcosa si rompe, si annulla la PR dal pulsante "Revert" di GitHub e si apre una issue.
- **Dal PC aziendale** `workers.dev` è bloccato: la ricerca di giochi e film non funziona da lì. Le prove vanno fatte da telefono o da casa.

## Regole tecniche

- **A ogni modifica di file dell'app, aumenta il numero in `CACHE` dentro `sw.js`** (es. `scaffale-7` → `scaffale-8`). Senza questo, i telefoni continuano a usare la versione vecchia. Se due PR aumentano lo stesso numero, la seconda va aggiornata prima del merge.
- **Non toccare `config.txt`** salvo richiesta esplicita: contiene indirizzi e chiavi di servizi esterni.
- **Compatibilità dei dati:** gli utenti hanno dati salvati sul telefono e nel cloud. Ogni modifica alla struttura dei dati deve leggere anche i dati vecchi (vedi `normDB` e le correzioni in `loadDB`) e non deve mai cancellare dati dell'utente.
- **Niente dipendenze o strumenti di build nuovi** senza prima discuterne in una issue.
- **Prova prima di proporre:** verifica almeno che l'app si apra senza errori nella console e che la funzione modificata faccia quello che deve.

## Problemi noti e decisioni

Le decisioni prese vanno scritte qui sotto (una riga, con il numero della issue), così restano per le sessioni successive.

- 07/11/2026 — Da ora si lavora solo con branch e pull request; il merge lo fa Andrea. I caricamenti a mano restano solo come ultima risorsa.
- Il ramo `prova-accesso` è servito solo a verificare l'accesso di Claude: si può eliminare da GitHub → Branches.

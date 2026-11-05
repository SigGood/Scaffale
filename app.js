/* Scaffale — diario personale di libri e videogiochi.
   Tutti i dati restano nel browser di questo dispositivo (localStorage).
   Ricerca: Google Books + Open Library (libri), RAWG (giochi). */
'use strict';

/* ================= utilità ================= */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const MONTHS = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
const MONTHS_SHORT = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const fmtDate = (iso) => { if (!iso) return ''; const [y, m, d] = iso.split('-'); return `${+d} ${MONTHS_SHORT[+m - 1]} ${y}`; };
const fmtNum = (n) => new Intl.NumberFormat('it-IT').format(Math.round(n));

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

const ICON = {
  back: '<svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
  bookmark: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4-6 4z"/></svg>',
  list: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9 7 7M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/></svg>',
  again: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5"/></svg>',
  text: '<svg class="ic" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  heartS: '<svg class="ic heart" viewBox="0 0 24 24"><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z"/></svg>',
  search: '<svg viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/></svg>',
};

/* ================= tipi ================= */
const TYPE = {
  book: {
    label: 'Libro', plural: 'Libri', creator: 'Autore', wish: 'Da leggere', log: 'Registra lettura',
    status: { finito: 'Letto', in_corso: 'In lettura', abbandonato: 'Abbandonato' },
  },
  game: {
    label: 'Gioco', plural: 'Giochi', creator: 'Sviluppatore', wish: 'Da giocare', log: 'Registra partita',
    status: { finito: 'Finito', completato: 'Completato al 100%', in_corso: 'In corso', abbandonato: 'Abbandonato' },
  },
};
const DONE = (e) => e.status === 'finito' || e.status === 'completato';
const BOOK_FORMATS = ['Cartaceo', 'Ebook', 'Audiolibro'];

/* ================= archivio ================= */
const KEY = 'scaffale-v1';
const UI_KEY = 'scaffale-ui';
const emptyDB = () => ({ version: 1, works: {}, entries: [], lists: [], favorites: { book: [], game: [] }, settings: { rawgKey: '' } });
let db = loadDB();
let ui = loadUI();

function loadDB() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const d = JSON.parse(raw);
      const base = emptyDB();
      return { ...base, ...d, favorites: { ...base.favorites, ...(d.favorites || {}) }, settings: { ...base.settings, ...(d.settings || {}) } };
    }
  } catch (e) { /* archivio illeggibile: si riparte vuoti */ }
  return emptyDB();
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; }
  catch (e) { toast('Memoria piena: esporta un backup e togli qualche copertina caricata a mano'); return false; }
}
function loadUI() { try { return JSON.parse(localStorage.getItem(UI_KEY)) || {}; } catch (e) { return {}; } }
function saveUI() { try { localStorage.setItem(UI_KEY, JSON.stringify(ui)); } catch (e) { /* non importa */ } }
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

const work = (id) => db.works[id];
const entriesOf = (wid) => db.entries.filter((e) => e.workId === wid);
const entryDate = (e) => e.end || e.start || (e.created || '').slice(0, 10);
const findBySource = (src, sid) => Object.values(db.works).find((w) => w.source === src && String(w.sourceId) === String(sid));

/* ================= copertine e stelle ================= */
function coverHTML(w, size = 'm', badge = '') {
  const b = badge ? `<span class="badge">${esc(badge)}</span>` : '';
  if (w && w.cover) {
    return `<div class="cover"><img src="${esc(w.cover)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('ph','${w.type}');this.parentNode.insertAdjacentText('beforeend',${esc(JSON.stringify(w.title || ''))});this.remove()">${b}</div>`;
  }
  return `<div class="cover ph ${w ? w.type : 'book'}">${esc(w ? w.title : '')}${b}</div>`;
}
function starsHTML(v, size) {
  if (!v) return '';
  let h = `<span class="stars" ${size ? `style="font-size:${size}"` : ''} aria-label="${v / 2} stelle su 5">`;
  for (let i = 1; i <= 5; i++) {
    const fill = v >= i * 2 ? 100 : v === i * 2 - 1 ? 50 : 0;
    h += `<span class="st"><i style="width:${fill}%"></i></span>`;
  }
  return h + '</span>';
}
const ratingText = (v) => (v ? (v / 2).toLocaleString('it-IT') : '—');

/* ================= rotte ================= */
let preview = null; // opera trovata in ricerca ma non ancora salvata

function parseHash() {
  const h = location.hash.replace(/^#\/?/, '') || 'diario';
  const [path, qs] = h.split('?');
  const parts = path.split('/').map(decodeURIComponent);
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: parts[0], id: parts[1], q };
}
function go(hash, replace = false) {
  if (replace) { history.replaceState(null, '', hash); render(); }
  else location.hash = hash;
}
window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); });

function render() {
  const r = parseHash();
  const tab = { diario: 'diario', cerca: 'cerca', 'da-fare': 'da-fare', liste: 'liste', lista: 'liste', profilo: 'profilo', impostazioni: 'profilo' }[r.name];
  $$('.tabbar a').forEach((a) => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  const view = $('#view');
  const V = {
    diario: viewDiary, cerca: viewSearch, 'da-fare': viewWish, liste: viewLists, lista: viewList,
    profilo: viewProfile, impostazioni: viewSettings, opera: viewWork, anteprima: viewWork,
  }[r.name] || viewDiary;
  view.innerHTML = V(r);
  if (V.after) V.after(r);
}

/* ================= DIARIO ================= */
function typeFilter(key, val) {
  return `<div class="seg" role="group" aria-label="Filtro">
    ${[['all', 'Tutto'], ['book', 'Libri'], ['game', 'Giochi']].map(([k, l]) => `<button data-act="filter" data-key="${key}" data-val="${k}" aria-pressed="${val === k}">${l}</button>`).join('')}
  </div>`;
}
function viewDiary(r) {
  const f = ui.diaryType || 'all';
  const tag = r.q.tag;
  const ok = (e) => { const w = work(e.workId); return w && (f === 'all' || w.type === f) && (!tag || (e.tags || []).includes(tag)); };
  const current = db.entries.filter((e) => e.status === 'in_corso' && ok(e)).sort((a, b) => (b.start || '').localeCompare(a.start || ''));
  const done = db.entries.filter((e) => e.status !== 'in_corso' && ok(e)).sort((a, b) => entryDate(b).localeCompare(entryDate(a)) || (b.created || '').localeCompare(a.created || ''));

  let h = `<header class="top"><h1>Diario</h1><a class="icon-btn" href="#/cerca" aria-label="Aggiungi">${ICON.plus}</a></header>${typeFilter('diaryType', f)}`;
  if (tag) h += `<p class="chips" style="margin-top:12px"><a class="chip on" href="#/diario">#${esc(tag)} ✕</a></p>`;

  if (current.length) {
    h += `<h2>In corso</h2><div class="strip">${current.map((e) => { const w = work(e.workId); return `<a href="#/opera/${w.id}">${coverHTML(w)}<span class="cap">${esc(w.title)}</span></a>`; }).join('')}</div>`;
  }
  if (!done.length && !current.length) {
    h += `<div class="empty"><p>${tag ? 'Nessuna voce con questo tag.' : 'Il diario è vuoto. Cerca un libro o un gioco che hai finito e registralo con data e voto.'}</p><a class="btn primary" href="#/cerca">${ICON.search} Cerca un titolo</a></div>`;
    return h;
  }
  let month = '';
  const count = {};
  done.forEach((e) => { const m = entryDate(e).slice(0, 7); count[m] = (count[m] || 0) + 1; });
  done.forEach((e) => {
    const w = work(e.workId);
    const d = entryDate(e);
    const m = d.slice(0, 7);
    if (m !== month) {
      month = m;
      const [y, mm] = m.split('-');
      h += `<div class="month">${cap(MONTHS[+mm - 1])} ${y}<small>${count[m]} ${count[m] === 1 ? 'voce' : 'voci'}</small></div>`;
    }
    const dow = new Date(d + 'T12:00').toLocaleDateString('it-IT', { weekday: 'short' });
    const badges = [];
    if (e.status === 'abbandonato') badges.push('<span class="pill drop">Abbandonato</span>');
    if (e.status === 'completato') badges.push('<span class="pill full">100%</span>');
    h += `<a class="entry" href="#/opera/${w.id}">
      <div class="day">${+d.slice(8)}<small>${esc(dow)}</small></div>
      ${coverHTML(w)}
      <div style="min-width:0"><div class="t">${esc(w.title)}</div>
        <div class="meta">${starsHTML(e.rating)}${e.liked ? ICON.heartS : ''}${e.again ? ICON.again : ''}${e.review ? ICON.text : ''}${badges.join('')}<span>${esc(w.year || '')}</span></div>
      </div></a>`;
  });
  return h;
}

/* ================= CERCA ================= */
let search = { type: 'book', q: '', results: null, loading: false, error: '' };
let searchTimer, searchSeq = 0;

function viewSearch() {
  search.type = ui.searchType || search.type;
  const t = search.type;
  const noKey = t === 'game' && !db.settings.rawgKey;
  let h = `<header class="top"><h1>Cerca</h1></header>
  <div class="seg" role="group" aria-label="Tipo"><button data-act="stype" data-val="book" aria-pressed="${t === 'book'}">Libri</button><button data-act="stype" data-val="game" aria-pressed="${t === 'game'}">Videogiochi</button></div>
  <form class="searchbar" data-form="search" role="search">
    <input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="${t === 'book' ? 'Titolo, autore o ISBN' : 'Nome del gioco'}" value="${esc(search.q)}" ${noKey ? 'disabled' : ''}>
  </form>`;
  if (noKey) {
    h += `<div class="note"><p><b>Serve una chiave gratuita di RAWG</b> per cercare i videogiochi. Si fa una volta sola.</p>
      <p class="small muted">1. Apri <a href="https://rawg.io/apidocs" target="_blank" rel="noopener">rawg.io/apidocs</a> e premi “Get API Key”.<br>2. Registrati (gratis) e compila il modulo: come sito puoi scrivere l'indirizzo di questa app.<br>3. Copia la chiave e incollala qui sotto.</p>
      <form class="searchbar" data-form="rawg" style="margin:0"><input id="rawgKey" type="text" placeholder="Incolla la chiave" autocomplete="off"><button class="btn primary">Salva</button></form></div>`;
  }
  h += `<div id="results">${resultsHTML()}</div>
  <div class="note" style="margin-top:24px"><p class="small muted">Non trovi quello che cerchi?</p><button class="btn" data-act="manual">${ICON.plus} Aggiungi a mano</button></div>`;
  return h;
}
viewSearch.after = () => { const q = $('#q'); if (q && !q.disabled && !search.results) q.focus(); };

function resultsHTML() {
  if (search.loading) return '<div class="spinner">Cerco…</div>';
  if (search.error) return `<div class="note"><p>${esc(search.error)}</p></div>`;
  if (!search.results) return '';
  if (!search.results.length) return '<div class="spinner">Nessun risultato. Prova con meno parole o aggiungilo a mano.</div>';
  return search.results.map((w, i) => {
    const have = findBySource(w.source, w.sourceId);
    return `<button class="result" data-act="pick" data-i="${i}">
      ${coverHTML(w)}
      <div style="min-width:0"><div class="t">${esc(w.title)}</div><div class="s">${esc([w.creator, w.year].filter(Boolean).join(' · '))}</div>
      <div class="src">${esc(w.sourceName)}</div></div>
      ${have ? '<span class="have">Già nel tuo scaffale</span>' : ''}
    </button>`;
  }).join('');
}
function refreshResults() { const el = $('#results'); if (el) el.innerHTML = resultsHTML(); }

async function runSearch(q) {
  q = q.trim();
  search.q = q;
  if (q.length < 2) { search.results = null; search.error = ''; refreshResults(); return; }
  const seq = ++searchSeq;
  search.loading = true; search.error = ''; refreshResults();
  try {
    const res = search.type === 'book' ? await searchBooks(q) : await searchGames(q);
    if (seq !== searchSeq) return;
    search.results = res;
  } catch (err) {
    if (seq !== searchSeq) return;
    search.results = null;
    search.error = err.message || 'Ricerca non riuscita. Controlla la connessione e riprova.';
  }
  search.loading = false;
  refreshResults();
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
  return r.json();
}
async function searchBooks(q) {
  const isbn = q.replace(/[-\s]/g, '');
  const gq = /^\d{10}(\d{3})?$/.test(isbn) ? 'isbn:' + isbn : q;
  const [g, o] = await Promise.allSettled([
    getJSON(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(gq)}&maxResults=15&printType=books`),
    getJSON(`https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=12&lang=it&fields=key,title,author_name,first_publish_year,cover_i,number_of_pages_median,subject`),
  ]);
  const out = [];
  if (g.status === 'fulfilled') {
    (g.value.items || []).forEach((it) => {
      const v = it.volumeInfo || {};
      let img = (v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail)) || '';
      img = img.replace(/^http:/, 'https:').replace('&edge=curl', '');
      out.push({
        type: 'book', title: v.subtitle && v.title.length < 30 ? `${v.title}. ${v.subtitle}` : v.title || 'Senza titolo',
        creator: (v.authors || []).join(', '), year: (v.publishedDate || '').slice(0, 4), cover: img,
        pages: v.pageCount || null, genres: (v.categories || []).slice(0, 3), platforms: [],
        source: 'gbooks', sourceId: it.id, sourceName: 'Google Books',
      });
    });
  }
  if (o.status === 'fulfilled') {
    (o.value.docs || []).forEach((d) => {
      out.push({
        type: 'book', title: d.title || 'Senza titolo', creator: (d.author_name || []).slice(0, 3).join(', '),
        year: d.first_publish_year ? String(d.first_publish_year) : '', cover: d.cover_i ? `https://covers.openlibrary.org/b/id/${d.cover_i}-L.jpg` : '',
        pages: d.number_of_pages_median || null, genres: (d.subject || []).slice(0, 3), platforms: [],
        source: 'openlibrary', sourceId: d.key, sourceName: 'Open Library',
      });
    });
  }
  if (g.status === 'rejected' && o.status === 'rejected') throw new Error('Ricerca non riuscita. Controlla la connessione e riprova.');
  return out;
}
function rawgImg(url, w = 640) { return url ? url.replace('/media/games/', `/media/resize/${w}/-/games/`).replace('/media/screenshots/', `/media/resize/${w}/-/screenshots/`) : ''; }
async function searchGames(q) {
  const key = db.settings.rawgKey;
  let d;
  try {
    d = await getJSON(`https://api.rawg.io/api/games?key=${encodeURIComponent(key)}&search=${encodeURIComponent(q)}&page_size=20&search_precise=true`);
  } catch (e) {
    if (e.status === 401 || e.status === 403) throw new Error('La chiave RAWG non funziona. Controllala in Profilo → Impostazioni.');
    throw new Error('Ricerca non riuscita. Controlla la connessione e riprova.');
  }
  return (d.results || []).map((g) => ({
    type: 'game', title: g.name, creator: '', year: (g.released || '').slice(0, 4), cover: rawgImg(g.background_image),
    pages: null, genres: (g.genres || []).map((x) => x.name).slice(0, 3), platforms: (g.platforms || []).map((p) => p.platform.name),
    source: 'rawg', sourceId: g.id, sourceName: 'RAWG',
  }));
}
async function enrichGame(w) {
  if (w.source !== 'rawg' || w.creator || !db.settings.rawgKey) return;
  try {
    const d = await getJSON(`https://api.rawg.io/api/games/${w.sourceId}?key=${encodeURIComponent(db.settings.rawgKey)}`);
    w.creator = (d.developers || []).map((x) => x.name).slice(0, 2).join(', ');
    if (!w.genres.length) w.genres = (d.genres || []).map((x) => x.name).slice(0, 3);
    if (db.works[w.id]) save();
    if (w.creator) { const by = $('#by'); if (by) by.textContent = w.creator; }
  } catch (e) { /* facoltativo */ }
}

/* ================= SCHEDA OPERA ================= */
function curWork() {
  const r = parseHash();
  return r.name === 'anteprima' ? preview : work(r.id);
}
function commitWork() {
  const r = parseHash();
  if (r.name !== 'anteprima' || !preview) return curWork();
  const existing = findBySource(preview.source, preview.sourceId);
  if (existing) { preview = null; history.replaceState(null, '', `#/opera/${existing.id}`); return existing; }
  const w = { ...preview, id: uid(), wish: false, liked: false, added: new Date().toISOString() };
  delete w.sourceName;
  db.works[w.id] = w;
  preview = null;
  save();
  history.replaceState(null, '', `#/opera/${w.id}`);
  return w;
}

function viewWork(r) {
  const w = r.name === 'anteprima' ? preview : work(r.id);
  if (!w) { setTimeout(() => go('#/diario', true)); return ''; }
  const T = TYPE[w.type];
  const es = db.entries.filter((e) => e.workId === w.id).sort((a, b) => entryDate(b).localeCompare(entryDate(a)));
  const rated = es.filter((e) => e.rating);
  const avg = rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : 0;
  const times = es.filter(DONE).length;
  const inLists = db.lists.filter((l) => l.items.includes(w.id)).length;
  const fav = (db.favorites[w.type] || []).includes(w.id);
  const meta = [];
  meta.push(`<span class="pill ${w.type}">${T.label}</span>`);
  if (w.year) meta.push(`<span class="pill" style="color:var(--muted)">${esc(w.year)}</span>`);
  if (w.pages) meta.push(`<span class="pill" style="color:var(--muted)">${w.pages} pagine</span>`);

  let h = `<header class="top"><button class="icon-btn" data-act="back" aria-label="Indietro">${ICON.back}</button><div style="flex:1"></div>
    ${r.name === 'opera' ? `<button class="icon-btn" data-act="edit-work" aria-label="Modifica informazioni">${ICON.edit}</button>` : ''}</header>
  <section class="hero">${coverHTML(w)}
    <div style="min-width:0"><h1>${esc(w.title)}</h1><div class="by" id="by">${esc(w.creator || '')}</div><div class="meta">${meta.join('')}</div></div>
  </section>
  <div class="actions">
    <button class="act like" data-act="like" aria-pressed="${!!w.liked}">${ICON.heart}<span>Mi piace</span></button>
    <button class="act" data-act="wish" aria-pressed="${!!w.wish}">${ICON.bookmark}<span>${T.wish}</span></button>
    <button class="act" data-act="to-list" aria-pressed="${inLists > 0}">${ICON.list}<span>${inLists ? `In ${inLists} ${inLists === 1 ? 'lista' : 'liste'}` : 'Liste'}</span></button>
    <button class="act" data-act="fav" aria-pressed="${fav}">${ICON.star}<span>Preferito</span></button>
  </div>
  <button class="btn primary block log-cta" data-act="log">${ICON.plus} ${T.log}</button>`;

  if (es.length) {
    h += `<div class="facts"><div class="fact"><b>${ratingText(Math.round(avg))}</b><span>il tuo voto</span></div>
      <div class="fact"><b>${times}</b><span>${times === 1 ? 'volta' : 'volte'} ${w.type === 'book' ? 'letto' : 'finito'}</span></div>
      <div class="fact"><b>${es.length}</b><span>${es.length === 1 ? 'voce' : 'voci'} nel diario</span></div></div>`;
    h += `<h2>Il tuo diario</h2>` + es.map((e) => {
      const extra = [];
      if (e.format) extra.push(e.format);
      if (e.platform) extra.push(e.platform);
      if (e.hours) extra.push(`${e.hours} ore`);
      if (e.start && e.end && e.start !== e.end) extra.push(`dal ${fmtDate(e.start)}`);
      return `<article class="log">
        <div class="head"><b>${e.status === 'in_corso' ? (e.start ? 'Iniziato il ' + fmtDate(e.start) : 'In corso') : fmtDate(entryDate(e))}</b>
          <button class="linkish" data-act="edit-entry" data-id="${e.id}">Modifica</button></div>
        <div class="meta" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${starsHTML(e.rating, '1.05rem')}${e.liked ? ICON.heartS : ''}${e.again ? ICON.again : ''}
          <span class="pill ${e.status === 'abbandonato' ? 'drop' : e.status === 'completato' ? 'full' : w.type}">${T.status[e.status] || e.status}</span>
          <span class="small muted">${esc(extra.join(' · '))}</span></div>
        ${e.review ? `<div class="review ${e.spoiler ? 'spoiler' : ''}" ${e.spoiler ? 'data-act="reveal" title="Contiene spoiler: tocca per leggere"' : ''}>${esc(e.review)}</div>` : ''}
        ${e.tags && e.tags.length ? `<div class="chips">${e.tags.map((t) => `<a class="chip" href="#/diario?tag=${encodeURIComponent(t)}">#${esc(t)}</a>`).join('')}</div>` : ''}
      </article>`;
    }).join('');
  }
  const info = [];
  if (w.platforms && w.platforms.length) info.push(`<p><span class="muted small">Piattaforme</span><br>${esc(w.platforms.join(', '))}</p>`);
  if (w.genres && w.genres.length) info.push(`<p><span class="muted small">Generi</span><br>${esc(w.genres.join(', '))}</p>`);
  if (info.length) h += `<h2>Informazioni</h2><div class="note">${info.join('')}</div>`;
  if (w.source && w.source !== 'manual') h += `<p class="small muted">Dati da ${{ gbooks: 'Google Books', openlibrary: 'Open Library', rawg: '<a href="https://rawg.io" target="_blank" rel="noopener">RAWG</a>' }[w.source] || ''}</p>`;
  return h;
}
viewWork.after = () => { const w = curWork(); if (w && w.type === 'game') enrichGame(w); };

/* ================= pannello: registra / modifica voce ================= */
const sheet = $('#sheet');
function openSheet(title, body, onSubmit) {
  sheet.innerHTML = `<form method="dialog" data-form="sheet"><div class="sheet-head"><button type="button" class="icon-btn" data-act="close-sheet" aria-label="Chiudi">${ICON.close}</button><h2>${esc(title)}</h2>${onSubmit ? '<button class="btn primary" value="ok">Salva</button>' : ''}</div><div class="sheet-body">${body}</div></form>`;
  sheet._submit = onSubmit;
  sheet.showModal();
  sheet.scrollTop = 0;
}
function closeSheet() { if (sheet.open) sheet.close(); }
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });

function starsInputHTML(v) {
  let s = '';
  for (let i = 1; i <= 5; i++) { const f = v >= i * 2 ? 100 : v === i * 2 - 1 ? 50 : 0; s += `<span class="st" data-i="${i}"><i style="width:${f}%"></i></span>`; }
  return `<div class="rating-row"><div class="stars-input" id="rating" data-val="${v || 0}" role="slider" tabindex="0" aria-label="Voto" aria-valuemin="0" aria-valuemax="5" aria-valuenow="${(v || 0) / 2}">${s}</div><span class="val" id="ratingVal">${ratingText(v)}</span></div>
  <span class="small muted">Tocca la metà sinistra di una stella per la mezza stella. Tocca di nuovo per togliere il voto.</span>`;
}
function setStars(el, v) {
  el.dataset.val = v;
  el.setAttribute('aria-valuenow', v / 2);
  $$('.st', el).forEach((s, idx) => { const i = idx + 1; s.firstChild.style.width = (v >= i * 2 ? 100 : v === i * 2 - 1 ? 50 : 0) + '%'; });
  $('#ratingVal').textContent = ratingText(v);
}

function openLog(w, entry) {
  const T = TYPE[w.type];
  const prevDone = db.entries.some((e) => e.workId === w.id && DONE(e) && (!entry || e.id !== entry.id));
  const e = entry || { status: 'finito', start: '', end: todayISO(), rating: 0, liked: false, again: prevDone, review: '', spoiler: false, tags: [], format: '', platform: '', hours: '', pages: w.pages || '' };
  const statusBtns = Object.entries(T.status).map(([k, l]) => `<button type="button" data-act="status" data-val="${k}" aria-pressed="${e.status === k}">${l}</button>`).join('');
  const allTags = [...new Set(db.entries.flatMap((x) => x.tags || []))].sort();
  const body = `
    <div style="display:grid;grid-template-columns:60px minmax(0,1fr);gap:12px;align-items:center">${coverHTML(w)}<div><b>${esc(w.title)}</b><div class="small muted">${esc([w.creator, w.year].filter(Boolean).join(' · '))}</div></div></div>
    <div class="seg wrap" role="group" aria-label="Stato" id="status" data-val="${e.status}">${statusBtns}</div>
    <div class="row">
      <label class="field"><span>Iniziato il</span><input type="date" id="f-start" value="${esc(e.start)}" max="${todayISO()}"></label>
      <label class="field" id="endWrap" ${e.status === 'in_corso' ? 'hidden' : ''}><span id="endLbl">${e.status === 'abbandonato' ? 'Abbandonato il' : 'Finito il'}</span><input type="date" id="f-end" value="${esc(e.end)}" max="${todayISO()}"></label>
    </div>
    <div class="field"><span>Voto</span>${starsInputHTML(e.rating)}</div>
    <div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap">
      <button type="button" class="heart-btn" id="f-liked" data-act="toggle-press" aria-pressed="${!!e.liked}" aria-label="Mi piace">${ICON.heart}</button>
      <label class="check"><input type="checkbox" id="f-again" ${e.again ? 'checked' : ''}> ${w.type === 'book' ? 'Riletto' : 'Rigiocato'}</label>
    </div>
    ${w.type === 'book' ? `<div class="row">
      <label class="field"><span>Formato</span><select id="f-format"><option value="">—</option>${BOOK_FORMATS.map((f) => `<option ${e.format === f ? 'selected' : ''}>${f}</option>`).join('')}</select></label>
      <label class="field"><span>Pagine</span><input type="number" inputmode="numeric" min="0" id="f-pages" value="${esc(e.pages || '')}"></label></div>`
    : `<div class="row">
      <label class="field"><span>Piattaforma</span><input type="text" id="f-platform" list="plats" value="${esc(e.platform)}" placeholder="es. Switch"><datalist id="plats">${(w.platforms || []).map((p) => `<option value="${esc(p)}">`).join('')}</datalist></label>
      <label class="field"><span>Ore giocate</span><input type="number" inputmode="decimal" min="0" step="0.5" id="f-hours" value="${esc(e.hours || '')}"></label></div>`}
    <label class="field"><span>Recensione</span><textarea id="f-review" placeholder="Cosa ne pensi?">${esc(e.review)}</textarea></label>
    <label class="check"><input type="checkbox" id="f-spoiler" ${e.spoiler ? 'checked' : ''}> Contiene spoiler</label>
    <label class="field"><span>Tag (separati da virgola)</span><input type="text" id="f-tags" list="tagList" value="${esc((e.tags || []).join(', '))}" placeholder="es. estate, regalo, in treno"><datalist id="tagList">${allTags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist></label>
    ${entry ? `<button type="button" class="btn danger" data-act="del-entry" data-id="${entry.id}">Elimina questa voce</button>` : ''}`;
  openSheet(entry ? 'Modifica voce' : T.log, body, () => {
    const status = $('#status').dataset.val;
    const val = (id) => { const el = $('#' + id); return el ? el.value.trim() : ''; };
    const data = {
      status, start: val('f-start'), end: status === 'in_corso' ? '' : val('f-end') || todayISO(),
      rating: +$('#rating').dataset.val || 0, liked: $('#f-liked').getAttribute('aria-pressed') === 'true',
      again: $('#f-again').checked, review: val('f-review'), spoiler: $('#f-spoiler').checked,
      tags: [...new Set(val('f-tags').split(',').map((t) => t.trim().replace(/^#/, '')).filter(Boolean))],
    };
    if (w.type === 'book') { data.format = val('f-format'); data.pages = +val('f-pages') || null; }
    else { data.platform = val('f-platform'); data.hours = +String(val('f-hours')).replace(',', '.') || null; }
    if (data.start && data.end && data.start > data.end) { toast('La data di inizio è dopo quella di fine'); return false; }
    const ww = commitWork();
    if (entry) Object.assign(entry, data);
    else db.entries.push({ id: uid(), workId: ww.id, created: new Date().toISOString(), ...data });
    if (data.liked) ww.liked = true;
    if (status !== 'in_corso' && ww.wish) ww.wish = false;
    if (w.type === 'book' && data.pages && !ww.pages) ww.pages = data.pages;
    save();
    toast(entry ? 'Voce aggiornata' : 'Aggiunto al diario');
    render();
  });
}

/* ================= modifica / aggiunta manuale ================= */
function openWorkEditor(w, isNew) {
  const t = w.type;
  const body = `
    ${isNew ? `<div class="seg" role="group" id="w-type" data-val="${t}"><button type="button" data-act="wtype" data-val="book" aria-pressed="${t === 'book'}">Libro</button><button type="button" data-act="wtype" data-val="game" aria-pressed="${t === 'game'}">Videogioco</button></div>` : ''}
    <label class="field"><span>Titolo</span><input type="text" id="w-title" value="${esc(w.title)}" required></label>
    <label class="field"><span id="w-creator-lbl">${TYPE[t].creator}</span><input type="text" id="w-creator" value="${esc(w.creator)}"></label>
    <div class="row"><label class="field"><span>Anno</span><input type="number" inputmode="numeric" id="w-year" value="${esc(w.year)}"></label>
      <label class="field" id="w-pages-wrap" ${t === 'game' ? 'hidden' : ''}><span>Pagine</span><input type="number" inputmode="numeric" id="w-pages" value="${esc(w.pages || '')}"></label></div>
    <label class="field" id="w-plat-wrap" ${t === 'book' ? 'hidden' : ''}><span>Piattaforme (separate da virgola)</span><input type="text" id="w-platforms" value="${esc((w.platforms || []).join(', '))}"></label>
    <label class="field"><span>Generi (separati da virgola)</span><input type="text" id="w-genres" value="${esc((w.genres || []).join(', '))}"></label>
    <div class="field"><span>Copertina</span>
      <div style="display:grid;grid-template-columns:80px minmax(0,1fr);gap:12px;align-items:start"><div id="w-cover-prev">${coverHTML(w)}</div>
      <div class="stack" style="gap:8px"><label class="btn" style="cursor:pointer">Carica foto<input type="file" accept="image/*" id="w-file" hidden></label>
      <input type="url" id="w-cover" placeholder="…oppure incolla un link a un'immagine" value="${esc(w.cover && !w.cover.startsWith('data:') ? w.cover : '')}">
      ${w.cover ? '<button type="button" class="linkish" data-act="rm-cover" style="justify-self:start">Togli copertina</button>' : ''}</div></div>
      <input type="hidden" id="w-cover-data" value="${w.cover && w.cover.startsWith('data:') ? 'keep' : ''}"></div>
    ${!isNew ? `<button type="button" class="btn danger" data-act="del-work">Elimina dallo scaffale</button>` : ''}`;
  let uploaded = w.cover && w.cover.startsWith('data:') ? w.cover : '';
  openSheet(isNew ? 'Aggiungi a mano' : 'Modifica informazioni', body, () => {
    const title = $('#w-title').value.trim();
    if (!title) { toast('Scrivi almeno il titolo'); return false; }
    const type = isNew ? $('#w-type').dataset.val : w.type;
    const list = (id) => $('#' + id).value.split(',').map((s) => s.trim()).filter(Boolean);
    const coverUrl = $('#w-cover').value.trim();
    const removed = $('#w-cover-data').value === 'removed';
    const data = {
      type, title, creator: $('#w-creator').value.trim(), year: $('#w-year').value.trim(),
      pages: type === 'book' ? +$('#w-pages').value || null : null,
      platforms: type === 'game' ? list('w-platforms') : [], genres: list('w-genres'),
      cover: sheet._upload || coverUrl || (removed ? '' : uploaded),
    };
    if (isNew) {
      const nw = { id: uid(), source: 'manual', sourceId: uid(), wish: false, liked: false, added: new Date().toISOString(), ...data };
      db.works[nw.id] = nw;
      if (save()) { closeSheet(); go(`#/opera/${nw.id}`); toast('Aggiunto allo scaffale'); }
      return;
    }
    Object.assign(w, data);
    save();
    render();
    toast('Informazioni aggiornate');
  });
  sheet._upload = '';
  $('#w-file').addEventListener('change', async (ev) => {
    const f = ev.target.files[0];
    if (!f) return;
    try {
      sheet._upload = await shrinkImage(f);
      $('#w-cover').value = '';
      $('#w-cover-prev').innerHTML = coverHTML({ ...w, cover: sheet._upload });
    } catch (e) { toast('Immagine non leggibile'); }
  });
}
function shrinkImage(file, maxH = 450) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const s = Math.min(1, maxH / img.height);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = url;
  });
}

/* ================= aggiunta a liste ================= */
function openListPicker(w) {
  const body = `${db.lists.length ? db.lists.map((l) => `<label class="check"><input type="checkbox" data-list="${l.id}" ${l.items.includes(w.id) ? 'checked' : ''}> ${esc(l.name)} <span class="muted small">(${l.items.length})</span></label>`).join('') : '<p class="muted" style="margin:0">Non hai ancora liste.</p>'}
    <label class="field"><span>Nuova lista</span><input type="text" id="newList" placeholder="es. Migliori RPG"></label>`;
  openSheet('Aggiungi a una lista', body, () => {
    const ww = commitWork();
    $$('[data-list]', sheet).forEach((c) => {
      const l = db.lists.find((x) => x.id === c.dataset.list);
      const has = l.items.includes(ww.id);
      if (c.checked && !has) l.items.push(ww.id);
      if (!c.checked && has) l.items = l.items.filter((x) => x !== ww.id);
    });
    const n = $('#newList').value.trim();
    if (n) db.lists.push({ id: uid(), name: n, description: '', items: [ww.id], created: new Date().toISOString() });
    save(); render(); toast('Liste aggiornate');
  });
}

/* ================= DA FARE ================= */
function viewWish() {
  const f = ui.wishType || 'all';
  const ws = Object.values(db.works).filter((w) => w.wish && (f === 'all' || w.type === f)).sort((a, b) => (b.wishAdded || '').localeCompare(a.wishAdded || ''));
  let h = `<header class="top"><h1>Da fare</h1></header>${typeFilter('wishType', f)}`;
  if (!ws.length) return h + `<div class="empty"><p>Qui finiscono i libri da leggere e i giochi da giocare. Aprine uno e tocca il segnalibro.</p><a class="btn primary" href="#/cerca">${ICON.search} Cerca un titolo</a></div>`;
  return h + `<p class="small muted">${ws.length} ${ws.length === 1 ? 'titolo' : 'titoli'}</p><div class="shelf wide">${ws.map((w) => `<a href="#/opera/${w.id}">${coverHTML(w)}<span class="cap">${esc(w.title)}</span></a>`).join('')}</div>`;
}

/* ================= LISTE ================= */
function viewLists() {
  let h = `<header class="top"><h1>Liste</h1><button class="icon-btn" data-act="new-list" aria-label="Nuova lista">${ICON.plus}</button></header>`;
  if (!db.lists.length) return h + `<div class="empty"><p>Crea liste come “Gialli nordici” o “Migliori giochi del 2026” e riempile dalle schede dei titoli.</p><button class="btn primary" data-act="new-list">${ICON.plus} Nuova lista</button></div>`;
  return h + db.lists.map((l) => `<a class="list-card" href="#/lista/${l.id}">
    <div class="fan">${l.items.slice(0, 5).map((id) => coverHTML(work(id))).join('') || '<span class="muted small">Vuota</span>'}</div>
    <div><h3>${esc(l.name)}</h3><span class="small muted">${l.items.length} ${l.items.length === 1 ? 'titolo' : 'titoli'}${l.description ? ' · ' + esc(l.description) : ''}</span></div></a>`).join('');
}
function openListEditor(l) {
  const body = `<label class="field"><span>Nome</span><input type="text" id="l-name" value="${esc(l ? l.name : '')}" required></label>
    <label class="field"><span>Descrizione</span><textarea id="l-desc" style="min-height:70px">${esc(l ? l.description : '')}</textarea></label>
    ${l ? `<label class="check"><input type="checkbox" id="l-ranked" ${l.ranked ? 'checked' : ''}> Lista numerata (classifica)</label><button type="button" class="btn danger" data-act="del-list" data-id="${l.id}">Elimina lista</button>` : ''}`;
  openSheet(l ? 'Modifica lista' : 'Nuova lista', body, () => {
    const name = $('#l-name').value.trim();
    if (!name) { toast('Dai un nome alla lista'); return false; }
    if (l) { l.name = name; l.description = $('#l-desc').value.trim(); l.ranked = $('#l-ranked').checked; save(); render(); }
    else { const nl = { id: uid(), name, description: $('#l-desc').value.trim(), items: [], created: new Date().toISOString() }; db.lists.push(nl); save(); go(`#/lista/${nl.id}`); }
  });
}
let listEditing = false;
function viewList(r) {
  const l = db.lists.find((x) => x.id === r.id);
  if (!l) { setTimeout(() => go('#/liste', true)); return ''; }
  let h = `<header class="top"><button class="icon-btn" data-act="back" aria-label="Indietro">${ICON.back}</button><h1>${esc(l.name)}</h1><button class="icon-btn" data-act="edit-list" data-id="${l.id}" aria-label="Modifica lista">${ICON.edit}</button></header>`;
  if (l.description) h += `<p class="muted">${esc(l.description)}</p>`;
  if (!l.items.length) return h + `<div class="empty"><p>Lista vuota. Apri un libro o un gioco e tocca “Liste” per aggiungerlo qui.</p></div>`;
  h += `<h2>${l.items.length} ${l.items.length === 1 ? 'titolo' : 'titoli'} <button data-act="list-edit-mode">${listEditing ? 'Fatto' : 'Riordina'}</button></h2>`;
  if (listEditing) {
    return h + l.items.map((id, i) => { const w = work(id); return `<div class="pick" style="grid-template-columns:40px minmax(0,1fr) auto">${coverHTML(w)}<span>${esc(w ? w.title : '?')}</span>
      <span style="display:flex;gap:4px"><button class="icon-btn" data-act="move" data-id="${l.id}" data-i="${i}" data-d="-1" aria-label="Su" ${i === 0 ? 'disabled' : ''}>↑</button><button class="icon-btn" data-act="move" data-id="${l.id}" data-i="${i}" data-d="1" aria-label="Giù" ${i === l.items.length - 1 ? 'disabled' : ''}>↓</button><button class="icon-btn" data-act="rm-item" data-id="${l.id}" data-i="${i}" aria-label="Togli">✕</button></span></div>`; }).join('');
  }
  return h + `<div class="shelf wide">${l.items.map((id, i) => { const w = work(id); return w ? `<a href="#/opera/${w.id}">${coverHTML(w, 'm', l.ranked ? String(i + 1) : '')}<span class="cap">${esc(w.title)}</span></a>` : ''; }).join('')}</div>`;
}

/* ================= PROFILO / STATISTICHE ================= */
function topCounts(arr, n = 5) {
  const m = new Map();
  arr.filter(Boolean).forEach((x) => m.set(x, (m.get(x) || 0) + 1));
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);
}
function rankHTML(title, rows, unit = '') {
  if (!rows.length) return '';
  return `<div><h2>${title}</h2><ul class="rank">${rows.map(([k, v]) => `<li><span>${esc(k)}</span><span>${v}${unit}</span></li>`).join('')}</ul></div>`;
}
function viewProfile() {
  const finished = db.entries.filter(DONE);
  const years = [...new Set(finished.map((e) => entryDate(e).slice(0, 4)))].sort().reverse();
  const thisYear = String(new Date().getFullYear());
  if (!years.includes(thisYear)) years.unshift(thisYear);
  const y = ui.statsYear && (ui.statsYear === 'all' || years.includes(ui.statsYear)) ? ui.statsYear : thisYear;
  const inY = (e) => y === 'all' || entryDate(e).startsWith(y);
  const fe = finished.filter(inY);
  const books = fe.filter((e) => work(e.workId)?.type === 'book');
  const games = fe.filter((e) => work(e.workId)?.type === 'game');
  const pages = books.reduce((s, e) => s + (e.pages || work(e.workId).pages || 0), 0);
  const hours = db.entries.filter((e) => inY(e) && work(e.workId)?.type === 'game').reduce((s, e) => s + (e.hours || 0), 0);
  const rated = db.entries.filter((e) => inY(e) && e.rating);
  const avg = rated.length ? rated.reduce((s, e) => s + e.rating, 0) / rated.length : 0;

  let h = `<header class="top"><h1>Il mio scaffale</h1><a class="icon-btn" href="#/impostazioni" aria-label="Impostazioni">${ICON.gear}</a></header>`;

  // preferiti
  ['book', 'game'].forEach((t) => {
    const favs = (db.favorites[t] || []).filter((id) => work(id));
    h += `<h2>${t === 'book' ? 'Libri preferiti' : 'Giochi preferiti'}</h2><div class="shelf">`;
    for (let i = 0; i < 4; i++) {
      const w = work(favs[i]);
      h += w ? `<a href="#/opera/${w.id}">${coverHTML(w)}</a>` : `<button class="fav-slot" data-act="fav-pick" data-type="${t}" aria-label="Scegli un preferito">+</button>`;
    }
    h += '</div>';
  });

  // anno
  h += `<h2>Statistiche</h2><div class="seg wrap" role="group" aria-label="Anno">${years.map((yy) => `<button data-act="year" data-val="${yy}" aria-pressed="${y === yy}">${yy}</button>`).join('')}<button data-act="year" data-val="all" aria-pressed="${y === 'all'}">Sempre</button></div>`;
  h += `<div class="big-nums" style="margin-top:12px">
    <div class="book"><b>${books.length}</b><span>libri letti</span></div>
    <div class="game"><b>${games.length}</b><span>giochi finiti</span></div>
    <div><b>${ratingText(Math.round(avg))}</b><span>voto medio</span></div>
    <div><b>${fmtNum(pages)}</b><span>pagine lette</span></div>
    <div><b>${fmtNum(hours)}</b><span>ore di gioco</span></div>
    <div><b>${fe.filter((e) => e.again).length}</b><span>riletti / rigiocati</span></div>
  </div>`;

  // grafico per mese o per anno
  let cols, labels;
  if (y === 'all') {
    const ys = [...new Set(finished.map((e) => entryDate(e).slice(0, 4)))].sort();
    cols = ys.map((yy) => [books.filter((e) => entryDate(e).startsWith(yy)).length, games.filter((e) => entryDate(e).startsWith(yy)).length]);
    labels = ys.map((yy) => "'" + yy.slice(2));
  } else {
    cols = MONTHS.map((_, i) => { const p = `${y}-${pad(i + 1)}`; return [books.filter((e) => entryDate(e).startsWith(p)).length, games.filter((e) => entryDate(e).startsWith(p)).length]; });
    labels = MONTHS.map((m) => m[0].toUpperCase());
  }
  if (cols.length) {
    const max = Math.max(1, ...cols.map(([b, g]) => b + g));
    h += `<h2>${y === 'all' ? 'Per anno' : 'Per mese'}</h2><div class="chart"><div class="bars">${cols.map(([b, g]) => `<div class="bar">
      <div class="seg-b" style="height:${(b / max) * 85}%"></div><div class="seg-g" style="height:${(g / max) * 85}%"></div>${b + g ? `<div class="num">${b + g}</div>` : ''}</div>`).join('')}</div>
      <div class="bar-labels">${labels.map((l) => `<span>${l}</span>`).join('')}</div>
      <div class="legend"><span><i style="background:var(--book)"></i>Libri</span><span><i style="background:var(--game)"></i>Giochi</span></div></div>`;
  }

  // distribuzione voti
  if (rated.length) {
    const dist = Array.from({ length: 10 }, (_, i) => rated.filter((e) => e.rating === i + 1).length);
    const m = Math.max(1, ...dist);
    h += `<h2>Voti dati <span class="muted small" style="text-transform:none;letter-spacing:0">${rated.length}</span></h2><div class="chart"><div class="bars" style="height:90px">${dist.map((c) => `<div class="bar"><div class="seg-r" style="height:${(c / m) * 80}%;min-height:${c ? 3 : 1}px;${c ? '' : 'opacity:.25'}"></div>${c ? `<div class="num">${c}</div>` : ''}</div>`).join('')}</div>
      <div class="bar-labels">${dist.map((_, i) => `<span>${i === 0 ? '½' : i === 9 ? '5★' : (i + 1) % 2 === 0 ? (i + 1) / 2 : ''}</span>`).join('')}</div></div>`;
  }

  // classifiche
  const authors = topCounts(books.flatMap((e) => (work(e.workId).creator || '').split(',').map((s) => s.trim())));
  const plats = topCounts(db.entries.filter((e) => inY(e) && work(e.workId)?.type === 'game').map((e) => e.platform));
  const genres = topCounts(fe.flatMap((e) => work(e.workId).genres || []));
  const tags = topCounts(db.entries.filter(inY).flatMap((e) => e.tags || []));
  const formats = topCounts(books.map((e) => e.format));
  h += `<div class="cols">${rankHTML('Autori più letti', authors)}${rankHTML('Piattaforme', plats)}${rankHTML('Generi', genres)}${rankHTML('Formati', formats)}${rankHTML('Tag', tags)}</div>`;

  // migliori dell'anno
  const best = fe.filter((e) => e.rating >= 8 || e.liked).sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 8);
  if (best.length) h += `<h2>I migliori ${y === 'all' ? 'di sempre' : 'del ' + y}</h2><div class="shelf">${best.map((e) => { const w = work(e.workId); return `<a href="#/opera/${w.id}">${coverHTML(w)}<span class="cap">${starsHTML(e.rating)}</span></a>`; }).join('')}</div>`;

  if (!finished.length) h += `<div class="empty"><p>Le statistiche si riempiono man mano che registri libri e giochi finiti.</p></div>`;
  return h;
}
function openFavPicker(type) {
  const done = [...new Set(db.entries.filter((e) => work(e.workId)?.type === type).map((e) => e.workId))];
  const pool = (done.length ? done : Object.values(db.works).filter((w) => w.type === type).map((w) => w.id))
    .filter((id) => !(db.favorites[type] || []).includes(id)).map(work).sort((a, b) => a.title.localeCompare(b.title));
  const body = pool.length
    ? `<input type="search" id="favq" placeholder="Filtra" autocomplete="off"><div id="favlist">${pool.map((w) => `<button type="button" class="pick" data-act="fav-set" data-id="${w.id}" data-t="${esc(w.title.toLowerCase())}">${coverHTML(w)}<span>${esc(w.title)}<br><span class="small muted">${esc(w.creator || '')}</span></span></button>`).join('')}</div>`
    : `<p class="muted" style="margin:0">Registra prima qualche ${type === 'book' ? 'libro' : 'gioco'} nel diario.</p>`;
  openSheet(type === 'book' ? 'Scegli un libro preferito' : 'Scegli un gioco preferito', body);
  const q = $('#favq');
  if (q) q.addEventListener('input', () => { const v = q.value.toLowerCase(); $$('#favlist .pick').forEach((b) => { b.hidden = !b.dataset.t.includes(v); }); });
}

/* ================= IMPOSTAZIONI ================= */
function viewSettings() {
  const nW = Object.keys(db.works).length;
  let size = 0;
  try { size = (localStorage.getItem(KEY) || '').length; } catch (e) { /* */ }
  return `<header class="top"><button class="icon-btn" data-act="back" aria-label="Indietro">${ICON.back}</button><h1>Impostazioni</h1></header>
  <h2>Chiave RAWG (videogiochi)</h2>
  <form class="searchbar" data-form="rawg" style="margin:0"><input id="rawgKey" type="text" autocomplete="off" placeholder="Incolla la chiave" value="${esc(db.settings.rawgKey)}"><button class="btn primary">Salva</button></form>
  <p class="small muted">La ottieni gratis su <a href="https://rawg.io/apidocs" target="_blank" rel="noopener">rawg.io/apidocs</a>. Resta salvata solo su questo dispositivo.</p>

  <h2>Backup</h2>
  <div class="note"><p class="small">I tuoi dati sono salvati solo in questo browser: ${nW} titoli, ${db.entries.length} voci, ${db.lists.length} liste (${Math.ceil(size / 1024)} KB). Esporta un backup ogni tanto e conservalo, per esempio su Drive o via email. Ti serve anche per spostare tutto su un altro telefono.</p>
    <button class="btn primary" data-act="export">Esporta backup</button>
    <label class="btn" style="cursor:pointer">Importa backup<input type="file" accept="application/json,.json" id="importFile" hidden></label></div>

  <h2>Installazione</h2>
  <div class="note"><p class="small"><b>iPhone</b>: apri questo sito con Safari, tocca Condividi e poi “Aggiungi alla schermata Home”.<br><b>Android</b>: apri con Chrome, menu ⋮ e poi “Installa app” o “Aggiungi a schermata Home”.<br>Così si apre a schermo intero come un'app e il browser non cancella i dati.</p></div>

  <h2>Zona pericolosa</h2>
  <button class="btn danger" data-act="wipe">Cancella tutti i dati</button>

  <p class="small muted" style="margin-top:28px">Dati dei libri: Google Books e <a href="https://openlibrary.org" target="_blank" rel="noopener">Open Library</a>. Dati dei giochi: <a href="https://rawg.io" target="_blank" rel="noopener">RAWG</a>.</p>`;
}
viewSettings.after = () => {
  const f = $('#importFile');
  if (f) f.addEventListener('change', async () => {
    const file = f.files[0];
    if (!file) return;
    try {
      const d = JSON.parse(await file.text());
      if (!d || typeof d.works !== 'object' || !Array.isArray(d.entries)) throw new Error();
      if (!confirm(`Il backup contiene ${Object.keys(d.works).length} titoli e ${d.entries.length} voci. Sostituisce i dati attuali. Continuare?`)) return;
      const base = emptyDB();
      db = { ...base, ...d, favorites: { ...base.favorites, ...(d.favorites || {}) }, settings: { ...base.settings, ...(d.settings || {}) } };
      save(); toast('Backup importato'); render();
    } catch (e) { toast('Questo file non è un backup di Scaffale'); }
    f.value = '';
  });
};
async function exportBackup() {
  const name = `scaffale-backup-${todayISO()}.json`;
  const blob = new Blob([JSON.stringify(db, null, 1)], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Backup Scaffale' }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ================= eventi ================= */
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;
  const w = () => curWork();
  switch (act) {
    case 'back': if (history.length > 1) history.back(); else go('#/diario'); break;
    case 'filter': ui[el.dataset.key] = el.dataset.val; saveUI(); render(); break;
    case 'stype': ui.searchType = search.type = el.dataset.val; saveUI(); search.results = null; search.error = ''; render(); if (search.q) runSearch(search.q); break;
    case 'pick': {
      const r = search.results[+el.dataset.i];
      const have = findBySource(r.source, r.sourceId);
      if (have) { go(`#/opera/${have.id}`); break; }
      preview = { ...r };
      go('#/anteprima');
      break;
    }
    case 'manual': openWorkEditor({ type: search.type, title: search.q || '', creator: '', year: '', pages: null, platforms: [], genres: [], cover: '' }, true); break;
    case 'like': { const x = commitWork(); x.liked = !x.liked; save(); render(); break; }
    case 'wish': { const x = commitWork(); x.wish = !x.wish; if (x.wish) x.wishAdded = new Date().toISOString(); save(); render(); toast(x.wish ? `Aggiunto a “${TYPE[x.type].wish}”` : 'Tolto dalla lista'); break; }
    case 'fav': {
      const x = commitWork();
      const f = db.favorites[x.type] = (db.favorites[x.type] || []).filter((id) => work(id));
      if (f.includes(x.id)) { db.favorites[x.type] = f.filter((id) => id !== x.id); toast('Tolto dai preferiti'); }
      else if (f.length >= 4) { toast('Hai già 4 preferiti: togline uno dal suo profilo'); break; }
      else { f.push(x.id); toast('Aggiunto ai preferiti'); }
      save(); render(); break;
    }
    case 'to-list': openListPicker(w()); break;
    case 'log': openLog(w()); break;
    case 'edit-entry': { const e = db.entries.find((x) => x.id === el.dataset.id); if (e) openLog(work(e.workId), e); break; }
    case 'del-entry':
      if (confirm('Eliminare questa voce del diario?')) { db.entries = db.entries.filter((x) => x.id !== el.dataset.id); save(); closeSheet(); render(); toast('Voce eliminata'); }
      break;
    case 'edit-work': openWorkEditor(w(), false); break;
    case 'del-work': {
      const x = w();
      if (!confirm(`Eliminare “${x.title}” e tutte le sue voci del diario?`)) break;
      delete db.works[x.id];
      db.entries = db.entries.filter((e) => e.workId !== x.id);
      db.lists.forEach((l) => { l.items = l.items.filter((id) => id !== x.id); });
      ['book', 'game'].forEach((t) => { db.favorites[t] = (db.favorites[t] || []).filter((id) => id !== x.id); });
      save(); closeSheet(); go('#/diario', true); toast('Eliminato');
      break;
    }
    case 'rm-cover': $('#w-cover').value = ''; $('#w-cover-data').value = 'removed'; sheet._upload = ''; $('#w-cover-prev').innerHTML = coverHTML({ ...w(), cover: '' }); el.remove(); break;
    case 'wtype': {
      const t = el.dataset.val; const g = $('#w-type'); g.dataset.val = t;
      $$('button', g).forEach((b) => b.setAttribute('aria-pressed', b.dataset.val === t));
      $('#w-creator-lbl').textContent = TYPE[t].creator; $('#w-pages-wrap').hidden = t === 'game'; $('#w-plat-wrap').hidden = t === 'book';
      break;
    }
    case 'status': {
      const g = $('#status'); g.dataset.val = el.dataset.val;
      $$('button', g).forEach((b) => b.setAttribute('aria-pressed', b === el));
      $('#endWrap').hidden = el.dataset.val === 'in_corso';
      $('#endLbl').textContent = el.dataset.val === 'abbandonato' ? 'Abbandonato il' : 'Finito il';
      if (el.dataset.val !== 'in_corso' && !$('#f-end').value) $('#f-end').value = todayISO();
      break;
    }
    case 'toggle-press': el.setAttribute('aria-pressed', el.getAttribute('aria-pressed') !== 'true'); break;
    case 'reveal': el.classList.toggle('show'); break;
    case 'close-sheet': closeSheet(); break;
    case 'new-list': openListEditor(null); break;
    case 'edit-list': openListEditor(db.lists.find((l) => l.id === el.dataset.id)); break;
    case 'del-list': if (confirm('Eliminare la lista? I titoli restano nello scaffale.')) { db.lists = db.lists.filter((l) => l.id !== el.dataset.id); save(); closeSheet(); go('#/liste', true); } break;
    case 'list-edit-mode': listEditing = !listEditing; render(); break;
    case 'move': {
      const l = db.lists.find((x) => x.id === el.dataset.id); const i = +el.dataset.i; const j = i + +el.dataset.d;
      [l.items[i], l.items[j]] = [l.items[j], l.items[i]]; save(); render(); break;
    }
    case 'rm-item': { const l = db.lists.find((x) => x.id === el.dataset.id); l.items.splice(+el.dataset.i, 1); save(); render(); break; }
    case 'year': ui.statsYear = el.dataset.val; saveUI(); render(); break;
    case 'fav-pick': openFavPicker(el.dataset.type); break;
    case 'fav-set': {
      const x = work(el.dataset.id);
      const f = db.favorites[x.type] = (db.favorites[x.type] || []).filter((id) => work(id));
      if (f.length < 4 && !f.includes(x.id)) f.push(x.id);
      save(); closeSheet(); render(); break;
    }
    case 'export': exportBackup(); break;
    case 'wipe':
      if (confirm('Cancellare davvero tutto? Senza un backup non si può tornare indietro.') && confirm('Ultima conferma: cancello tutti i dati?')) {
        const key = db.settings.rawgKey; db = emptyDB(); db.settings.rawgKey = key; save(); go('#/diario'); toast('Dati cancellati');
      }
      break;
  }
});

// stelle: tocco su metà sinistra = mezza stella
document.addEventListener('click', (ev) => {
  const st = ev.target.closest('.stars-input .st');
  if (!st) return;
  const box = st.getBoundingClientRect();
  const i = +st.dataset.i;
  const half = ev.clientX - box.left < box.width / 2;
  const v = (i - 1) * 2 + (half ? 1 : 2);
  const el = st.parentNode;
  setStars(el, +el.dataset.val === v ? 0 : v);
});
document.addEventListener('keydown', (ev) => {
  const el = ev.target.closest && ev.target.closest('.stars-input');
  if (!el) return;
  let v = +el.dataset.val;
  if (ev.key === 'ArrowRight' || ev.key === 'ArrowUp') v = Math.min(10, v + 1);
  else if (ev.key === 'ArrowLeft' || ev.key === 'ArrowDown') v = Math.max(0, v - 1);
  else return;
  ev.preventDefault(); setStars(el, v);
});

document.addEventListener('submit', (ev) => {
  const f = ev.target.closest('[data-form]');
  if (!f) return;
  ev.preventDefault();
  const kind = f.dataset.form;
  if (kind === 'search') { clearTimeout(searchTimer); runSearch($('#q').value); $('#q').blur(); }
  if (kind === 'rawg') {
    db.settings.rawgKey = $('#rawgKey').value.trim(); save();
    toast(db.settings.rawgKey ? 'Chiave salvata' : 'Chiave rimossa');
    render();
  }
  if (kind === 'sheet') {
    const ok = sheet._submit ? sheet._submit() : true;
    if (ok !== false) closeSheet();
  }
});
document.addEventListener('input', (ev) => {
  if (ev.target.id === 'q') {
    clearTimeout(searchTimer);
    const v = ev.target.value;
    searchTimer = setTimeout(() => runSearch(v), 450);
  }
});

render();

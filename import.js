/* Scaffale — importazione da Letterboxd e Goodreads, e abbinamento automatico
   di locandine e informazioni (TMDB per i film, Google Books / Open Library per i libri). */
'use strict';

/* ---------- CSV ---------- */
function parseCSV(text) {
  text = text.replace(/^﻿/, '');
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}
function csvObjects(text) {
  const rows = parseCSV(text).filter((r) => r.some((x) => x !== ''));
  if (!rows.length) return [];
  const head = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Non riesco a caricare ' + src)); document.head.appendChild(s); });
}
const fmtCount = (n, one, many) => `${fmtNum(n)} ${n === 1 ? one : many}`;

/* ================= LETTERBOXD ================= */
let pendingImport = null;

async function prepareLetterboxd(file) {
  openSheet('Importa da Letterboxd', '<div class="spinner">Leggo il file…</div>');
  try {
    if (!window.JSZip) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    const zip = await JSZip.loadAsync(file);
    const all = Object.values(zip.files).filter((f) => !f.dir && !/(^|\/)(deleted|orphaned)\//.test(f.name) && !/(^|\/)__MACOSX\//.test(f.name));
    const find = (name) => all.filter((f) => f.name === name || f.name.endsWith('/' + name)).sort((a, b) => a.name.length - b.name.length)[0];
    const read = async (name) => { const f = find(name); return f ? csvObjects(await f.async('string')) : []; };
    const data = {
      diary: await read('diary.csv'), reviews: await read('reviews.csv'), ratings: await read('ratings.csv'),
      watched: await read('watched.csv'), watchlist: await read('watchlist.csv'), likes: await read('likes/films.csv'),
      profile: (await read('profile.csv'))[0] || null, lists: [],
    };
    for (const f of all.filter((x) => /(^|\/)lists\/[^/]+\.csv$/.test(x.name))) {
      const rows = parseCSV(await f.async('string'));
      const mi = rows.findIndex((r) => r[0] === 'Date' && r[1] === 'Name');
      const ii = rows.findIndex((r) => r[0] === 'Position' && r[1] === 'Name');
      if (mi < 0 || ii < 0) continue;
      const meta = rows[mi + 1] || [];
      data.lists.push({ name: meta[1] || f.name.split('/').pop().replace(/\.csv$/, ''), description: meta[4] || '', items: rows.slice(ii + 1).filter((r) => r[1]).map((r) => ({ name: r[1], year: r[2], uri: r[3] })) });
    }
    if (!data.diary.length && !data.watched.length && !data.ratings.length) throw new Error('Nello zip non trovo i file di Letterboxd (diary.csv, watched.csv…). Hai caricato l\'export giusto?');
    const films = new Set([...data.watched, ...data.diary, ...data.ratings, ...data.watchlist].map((r) => r.Name + '|' + r.Year));
    pendingImport = { kind: 'letterboxd', data };
    sheet.querySelector('.sheet-body').innerHTML = `
      <p>Ho trovato:</p>
      <ul class="rank">
        <li><span>Film</span><span>${fmtNum(films.size)}</span></li>
        <li><span>Voci di diario</span><span>${fmtNum(data.diary.length)}</span></li>
        <li><span>Recensioni</span><span>${fmtNum(data.reviews.length)}</span></li>
        <li><span>Voti</span><span>${fmtNum(data.ratings.length)}</span></li>
        <li><span>Mi piace</span><span>${fmtNum(data.likes.length)}</span></li>
        <li><span>Watchlist</span><span>${fmtNum(data.watchlist.length)}</span></li>
        <li><span>Liste</span><span>${fmtNum(data.lists.length)}</span></li>
      </ul>
      <p class="small muted">Se hai già importato in passato, aggiungo solo quello che manca. Dopo l'importazione l'app cerca le locandine su TMDB: con molti film ci vogliono alcuni minuti, tieni l'app aperta (puoi usarla nel frattempo).</p>
      <button class="btn primary block" data-act="do-import">Importa</button>`;
  } catch (e) {
    sheet.querySelector('.sheet-body').innerHTML = `<p>${esc(e.message || 'Non riesco a leggere questo file.')}</p>`;
  }
}

function applyLetterboxd(data) {
  const stats = { films: 0, entries: 0, lists: 0 };
  const byKey = new Map(Object.values(db.works).filter((w) => w.lbKey).map((w) => [w.lbKey, w]));
  const uriKey = new Map();
  const film = (name, year) => {
    const key = name + '|' + (year || '');
    let w = byKey.get(key);
    if (!w) {
      w = { id: uid(), type: 'film', title: name, lbName: name, lbYear: year || '', year: year || '', creator: '', cover: '', pages: null, runtime: null, platforms: [], genres: [],
        source: 'letterboxd', sourceId: key, lbKey: key, pending: 'tmdb', wish: false, liked: false, added: new Date().toISOString() };
      db.works[w.id] = w; byKey.set(key, w); stats.films++;
    }
    return w;
  };
  const r2 = (v) => (v ? Math.round(parseFloat(v) * 2) : 0);
  const tagsOf = (t) => (t ? t.split(',').map((x) => x.trim()).filter(Boolean) : []);

  data.watched.forEach((r) => { const w = film(r.Name, r.Year); w.seen = true; if (r['Letterboxd URI']) uriKey.set(r['Letterboxd URI'], w); });
  data.ratings.forEach((r) => { const w = film(r.Name, r.Year); w.rating = r2(r.Rating); w.seen = true; if (r['Letterboxd URI']) uriKey.set(r['Letterboxd URI'], w); });
  data.likes.forEach((r) => { const w = film(r.Name, r.Year); w.liked = true; if (r['Letterboxd URI']) uriKey.set(r['Letterboxd URI'], w); });
  data.watchlist.forEach((r) => {
    const w = film(r.Name, r.Year);
    if (!w.seen && !db.entries.some((e) => e.workId === w.id)) { w.wish = true; w.wishAdded = w.wishAdded || (r.Date ? r.Date + 'T00:00:00Z' : ''); }
    if (r['Letterboxd URI']) uriKey.set(r['Letterboxd URI'], w);
  });

  const existingUris = new Set(db.entries.map((e) => e.lbUri).filter(Boolean));
  const byUri = new Map();
  data.diary.forEach((r) => {
    const w = film(r.Name, r.Year);
    const uri = r['Letterboxd URI'];
    if (uri && existingUris.has(uri)) return;
    const e = {
      id: uid(), workId: w.id, status: 'finito', start: '', end: r['Watched Date'] || r.Date || '', rating: r2(r.Rating), liked: false,
      again: r.Rewatch === 'Yes', review: '', spoiler: false, tags: tagsOf(r.Tags), lbUri: uri || '', created: (r.Date || todayISO()) + 'T12:00:00Z',
    };
    if (!e.end) { e.undated = true; }
    db.entries.push(e); stats.entries++;
    if (uri) byUri.set(uri, e);
    w.seen = true;
  });
  data.reviews.forEach((r) => {
    if (!r.Review) return;
    const uri = r['Letterboxd URI'];
    let e = uri && byUri.get(uri);
    if (!e && uri && existingUris.has(uri)) return; // già importata in passato
    const w = film(r.Name, r.Year);
    if (!e) e = db.entries.find((x) => x.workId === w.id && x.end === (r['Watched Date'] || '') && !x.review);
    if (!e) {
      e = { id: uid(), workId: w.id, status: 'finito', start: '', end: r['Watched Date'] || '', rating: r2(r.Rating), liked: false, again: r.Rewatch === 'Yes',
        review: '', spoiler: false, tags: tagsOf(r.Tags), lbUri: uri || '', created: (r.Date || todayISO()) + 'T12:00:00Z' };
      if (!e.end) e.undated = true;
      db.entries.push(e); stats.entries++;
    }
    e.review = r.Review.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>\s*<p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
  });
  // il "mi piace" di Letterboxd è sul film: lo riporto sull'ultima visione
  Object.values(db.works).forEach((w) => {
    if (w.type !== 'film' || !w.liked) return;
    const last = db.entries.filter((e) => e.workId === w.id && entryDate(e)).sort((a, b) => entryDate(b).localeCompare(entryDate(a)))[0];
    if (last) last.liked = true;
  });

  data.lists.forEach((l) => {
    const ids = l.items.map((it) => film(it.name, it.year).id);
    let list = db.lists.find((x) => x.lbName === l.name);
    if (!list) { list = { id: uid(), name: l.name, lbName: l.name, description: l.description, items: [], created: new Date().toISOString() }; db.lists.push(list); stats.lists++; }
    list.items = [...new Set(ids)];
  });

  const favs = data.profile && (data.profile['Favorite Films'] || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (favs && favs.length) {
    const ids = favs.map((u) => uriKey.get(u)).filter(Boolean).map((w) => w.id);
    if (ids.length) db.favorites.film = [...new Set(ids)].slice(0, 4);
  }
  return stats;
}

/* ================= GOODREADS ================= */
async function prepareGoodreads(file) {
  openSheet('Importa da Goodreads', '<div class="spinner">Leggo il file…</div>');
  try {
    const rows = csvObjects(await file.text());
    if (!rows.length || !('Exclusive Shelf' in rows[0])) throw new Error('Questo non sembra l\'export di Goodreads (manca la colonna “Exclusive Shelf”).');
    const count = (s) => rows.filter((r) => r['Exclusive Shelf'] === s).length;
    const reviews = rows.filter((r) => r['My Review']).length;
    const shelves = [...new Set(rows.flatMap((r) => (r.Bookshelves || '').split(',').map((x) => x.trim())).filter((x) => x && !['read', 'to-read', 'currently-reading'].includes(x)))];
    pendingImport = { kind: 'goodreads', rows };
    sheet.querySelector('.sheet-body').innerHTML = `
      <p>Ho trovato ${fmtCount(rows.length, 'libro', 'libri')}:</p>
      <ul class="rank">
        <li><span>Letti</span><span>${fmtNum(count('read'))}</span></li>
        <li><span>In lettura</span><span>${fmtNum(count('currently-reading'))}</span></li>
        <li><span>Da leggere</span><span>${fmtNum(count('to-read'))}</span></li>
        <li><span>Recensioni</span><span>${fmtNum(reviews)}</span></li>
        <li><span>Scaffali personali</span><span>${fmtNum(shelves.length)}</span></li>
      </ul>
      ${shelves.length ? `<div class="field"><span>Gli scaffali personali (${esc(shelves.slice(0, 4).join(', '))}${shelves.length > 4 ? '…' : ''}) diventano</span>
        <div class="seg" role="group" id="grShelves" data-val="tags"><button type="button" data-act="gr-shelves" data-val="tags" aria-pressed="true">Tag</button><button type="button" data-act="gr-shelves" data-val="lists" aria-pressed="false">Liste</button></div></div>` : ''}
      <p class="small muted">Se hai già importato in passato, aggiorno i libri esistenti senza creare doppioni. Dopo l'importazione cerco le copertine dall'ISBN.</p>
      <button class="btn primary block" data-act="do-import">Importa</button>`;
  } catch (e) {
    sheet.querySelector('.sheet-body').innerHTML = `<p>${esc(e.message || 'Non riesco a leggere questo file.')}</p>`;
  }
}

function applyGoodreads(rows, shelvesAs) {
  const stats = { films: 0, entries: 0, lists: 0 };
  const byId = new Map(Object.values(db.works).filter((w) => w.grId).map((w) => [w.grId, w]));
  const clean = (v) => (v || '').replace(/^="?|"$/g, '').replace(/[^0-9Xx]/g, '');
  const date = (v) => (v ? v.replace(/\//g, '-').slice(0, 10) : '');
  const listMap = new Map(db.lists.filter((l) => l.grShelf).map((l) => [l.grShelf, l]));
  rows.forEach((r) => {
    const gid = r['Book Id'];
    if (!gid || !r.Title) return;
    const isbn = clean(r.ISBN13) || clean(r.ISBN);
    let w = byId.get(gid);
    if (!w) {
      w = { id: uid(), type: 'book', title: r.Title, creator: [r.Author, r['Additional Authors']].filter(Boolean).join(', '),
        year: r['Original Publication Year'] || r['Year Published'] || '', pages: +r['Number of Pages'] || null, platforms: [], genres: [],
        cover: isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false` : '', isbn, source: 'goodreads', sourceId: gid, grId: gid,
        pending: 'books', wish: false, liked: false, added: new Date().toISOString() };
      db.works[w.id] = w; byId.set(gid, w); stats.films++;
    }
    const shelf = r['Exclusive Shelf'];
    const rating = (+r['My Rating'] || 0) * 2;
    const review = (r['My Review'] || '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').trim();
    const custom = (r.Bookshelves || '').split(',').map((x) => x.trim()).filter((x) => x && !['read', 'to-read', 'currently-reading'].includes(x));
    if (shelvesAs === 'lists') {
      custom.forEach((sh) => {
        let l = listMap.get(sh);
        if (!l) { l = { id: uid(), name: sh, grShelf: sh, description: 'Da Goodreads', items: [], created: new Date().toISOString() }; db.lists.push(l); listMap.set(sh, l); stats.lists++; }
        if (!l.items.includes(w.id)) l.items.push(w.id);
      });
    }
    const tags = shelvesAs === 'tags' ? custom : [];
    const key = gid + '|' + shelf + '|' + (r['Date Read'] || '');
    if (db.entries.some((e) => e.grKey === key)) return;
    if (shelf === 'to-read') { w.wish = true; w.wishAdded = date(r['Date Added']) + 'T00:00:00Z'; return; }
    if (shelf === 'currently-reading') {
      db.entries.push({ id: uid(), workId: w.id, status: 'in_corso', start: date(r['Date Added']), end: '', rating, liked: false, again: false, review, spoiler: r.Spoiler === 'true', tags, grKey: key, created: new Date().toISOString() });
      stats.entries++; return;
    }
    if (shelf === 'read') {
      const end = date(r['Date Read']);
      w.seen = true; w.wish = false;
      if (rating) w.rating = rating;
      if (+r['Read Count'] > 1) w.readCount = +r['Read Count'];
      if (end || review || tags.length) {
        db.entries.push({ id: uid(), workId: w.id, status: 'finito', start: '', end, undated: !end, rating, liked: false, again: false, review, spoiler: r.Spoiler === 'true', tags, grKey: key, created: (date(r['Date Added']) || todayISO()) + 'T12:00:00Z' });
        stats.entries++;
      }
    }
  });
  return stats;
}

function doImport() {
  if (!pendingImport) return;
  const p = pendingImport;
  pendingImport = null;
  const st = p.kind === 'letterboxd' ? applyLetterboxd(p.data) : applyGoodreads(p.rows, ($('#grShelves') || {}).dataset ? $('#grShelves').dataset.val : 'tags');
  save();
  closeSheet();
  toast(`Importati ${fmtCount(st.films, 'titolo nuovo', 'titoli nuovi')} e ${fmtCount(st.entries, 'voce', 'voci')}`);
  render();
  runMatcher();
}

/* ================= ABBINAMENTO AUTOMATICO ================= */
const matcher = { running: false, done: 0, total: 0, paused: '' };

function matchStatusHTML() {
  const left = Object.values(db.works).filter((w) => w.pending && (w.pending !== 'tmdb' || appConfig.ponte)).length;
  const waiting = Object.values(db.works).filter((w) => w.pending === 'tmdb').length;
  if (matcher.running) return `<p class="small matchprog" style="color:var(--accent)">Cerco locandine e informazioni: ${fmtNum(matcher.done)} di ${fmtNum(matcher.total)}… tieni l'app aperta.</p>`;
  if (matcher.paused) return `<p class="small" style="color:var(--heart)">${esc(matcher.paused)} <button class="linkish" data-act="match-retry">Riprova</button></p>`;
  if (!appConfig.ponte && waiting) return `<p class="small muted">${fmtCount(waiting, 'film aspetta', 'film aspettano')} la locandina: arriverà quando il ponte sarà configurato.</p>`;
  if (left) return `<p class="small muted">${fmtCount(left, 'titolo', 'titoli')} da completare. <button class="linkish" data-act="match-retry">Avvia</button></p>`;
  return '';
}
function updateMatchUI() { $$('.matchprog').forEach((el) => { el.textContent = `Cerco locandine e informazioni: ${fmtNum(matcher.done)} di ${fmtNum(matcher.total)}… tieni l'app aperta.`; }); }

const sameYear = (a, b) => !a || !b || Math.abs(+a - +b) <= 1;
async function matchFilm(w) {
  const name = w.lbName || w.title;
  let d = await ponte(`/tmdb/search/movie?query=${encodeURIComponent(name)}${w.lbYear ? '&year=' + w.lbYear : ''}&language=it-IT&include_adult=false`);
  let res = d.results || [];
  if (!res.length && w.lbYear) res = (await ponte(`/tmdb/search/movie?query=${encodeURIComponent(name)}&language=it-IT&include_adult=false`)).results || [];
  if (!res.length) { w.pending = null; w.check = 'nessun risultato su TMDB'; delete w.pending; return w; }
  const norm2 = (s) => norm(s);
  const best = res.find((m) => (norm2(m.original_title) === norm2(name) || norm2(m.title) === norm2(name)) && (m.release_date || '').slice(0, 4) === w.lbYear)
    || res.find((m) => (m.release_date || '').slice(0, 4) === w.lbYear) || res[0];
  const base = filmFromTmdb(best);
  let det = {};
  try { det = await tmdbDetails(base, best.id); } catch (e) { if (e.code === 'net') throw e; }
  const lbYear = w.lbYear;
  const out = applyMatch(w, { ...base, ...det });
  out.lbName = name; out.lbYear = lbYear;
  if (!sameYear(out.year, lbYear)) out.check = `anno diverso (${out.year} invece di ${lbYear})`;
  else if (norm2(best.original_title) !== norm2(name) && norm2(best.title) !== norm2(name)) out.check = 'titolo diverso';
  return out;
}
async function matchBook(w) {
  if (!w.isbn) { delete w.pending; if (!w.cover) w.check = 'senza ISBN: copertina da cercare'; return w; }
  try {
    const d = await getJSON(`https://www.googleapis.com/books/v1/volumes?q=isbn:${w.isbn}&maxResults=1`);
    const v = d.items && d.items[0] && d.items[0].volumeInfo;
    if (v) {
      const img = v.imageLinks && (v.imageLinks.thumbnail || v.imageLinks.smallThumbnail);
      if (img) w.cover = img.replace(/^http:/, 'https:').replace('&edge=curl', '');
      if (!w.pages && v.pageCount) w.pages = v.pageCount;
      if (!w.genres.length && v.categories) w.genres = v.categories.slice(0, 3);
    }
  } catch (e) {
    if (!e.status) throw Object.assign(e, { code: 'net' });
    if (e.status === 429 || e.status >= 500) throw e;
  }
  delete w.pending;
  return w;
}

async function runMatcher() {
  if (matcher.running) return;
  const queue = Object.values(db.works).filter((w) => w.pending && (w.pending !== 'tmdb' || appConfig.ponte));
  if (!queue.length) return;
  matcher.running = true; matcher.paused = ''; matcher.done = 0; matcher.total = queue.length;
  softRender();
  let lastSave = Date.now(), stop = '';
  const worker = async () => {
    while (queue.length && !stop) {
      const w = db.works[queue.shift().id];
      if (!w || !w.pending) { matcher.done++; continue; }
      try {
        if (w.pending === 'tmdb') await matchFilm(w); else await matchBook(w);
      } catch (e) {
        if (e.code === 'net' || e.status === 429 || (e.status >= 500)) { stop = e.code === 'net' ? 'Ricerca locandine in pausa: sei offline.' : 'Ricerca locandine in pausa: il servizio è occupato.'; break; }
        if (e.status === 401 || e.status === 403) { stop = e.message; break; }
        delete w.pending; w.check = 'errore durante la ricerca';
      }
      matcher.done++;
      updateMatchUI();
      if (Date.now() - lastSave > 4000) { lastSave = Date.now(); save(); }
      await new Promise((r) => setTimeout(r, 60));
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  matcher.running = false;
  matcher.paused = stop;
  save();
  softRender();
  if (!stop) {
    const n = Object.values(db.works).filter((w) => w.check).length;
    toast(n ? `Locandine completate. ${fmtCount(n, 'titolo', 'titoli')} da controllare in Impostazioni` : 'Locandine completate');
  }
}

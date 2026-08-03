/**
 * Galeria publica.
 *
 * Oricine o vede, fara cont. Grid-ul foloseste thumbnail-uri (mici,
 * se incarca rapid pe telefon), iar la click se deschide originalul
 * intr-un vizualizator care se poarta ca galeria din telefon:
 * swipe stanga/dreapta pentru poza urmatoare, swipe in jos pentru
 * inchidere, butoane din sticla peste poza.
 *
 * Cat timp nu exista nicio poza, ramane blocul "Coming soon".
 */

import { sb, esteFotograf } from './login-ascuns.js';
import { WORKER_URL } from './config.js';
import { deschide } from './vizualizator.js';

const comingSoon = document.querySelector('.coming-soon')?.closest('section');
const sectiune   = document.getElementById('galerie-reala');
const grid       = document.getElementById('galerie-grid');

const poze = [];   // se modifica pe loc, nu se reatribuie
let potSterge = false;

// Poza 1x1 transparenta, pusa cat timp o miniatura e "eliberata" din memorie.
const GOL = 'data:image/gif;base64,R0lGODlhAQABAAAAACwAAAAAAQABAAA=';

// Tinem incarcate in memorie DOAR miniaturile din/langa ecran; pe cele care ies
// mult din vedere le eliberam. Fara asta, dupa mult scroll prin sute de poze,
// browserul (mai ales pe iPhone) umple memoria de imagini si incepe sa le
// afiseze degradat/low-res. La scroll inapoi se reincarca instant din cache.
let observator = null;

/** Calea din R2 → adresa completa. Construita aici, nu salvata in baza. */
const adresa = (cheie) => `${WORKER_URL}/f/${cheie}`;

/** Deschide poza i in vizualizatorul pe tot ecranul. */
function vizualizator(i) {
  deschide({
    poze,
    pornireLa: i,
    adresa,
    potSterge,
    laStergere: stergePoza,
  });
}

incarca();

/** Interogarea unica pentru lista de poze — folosita si la incarcare si
 *  la resincronizarea periodica. Intoarce null doar la eroare. */
async function preiaPoze() {
  const { data, error } = await sb
    .from('photos')
    .select('id,storage_key,thumb_key,width,height,size_bytes,day_tag,created_at')
    .order('created_at', { ascending: false });

  if (error) { console.error('[galerie]', error.message); return null; }
  return data || [];
}

async function incarca() {
  const data = await preiaPoze();
  if (data === null) return;
  poze.splice(0, poze.length, ...data);
  potSterge = await esteFotograf().catch(() => false);
  deseneaza();
  asculta();
  autoActualizare();
}

function deseneaza() {
  if (!poze.length) {          // nicio poza inca → ramane "Coming soon"
    sectiune.hidden = true;
    if (comingSoon) comingSoon.hidden = false;
    return;
  }
  if (comingSoon) comingSoon.hidden = true;
  sectiune.hidden = false;

  // Observatorul care tine memoria sub control: incarca miniatura cand se
  // apropie de ecran si o elibereaza cand se departeaza mult.
  if (observator) observator.disconnect();
  observator = new IntersectionObserver((intrari) => {
    for (const e of intrari) {
      const img = e.target;
      if (e.isIntersecting) {
        if (img.src !== img.dataset.src) img.src = img.dataset.src;   // aproape → incarca
      } else if (img.src !== GOL) {
        img.src = GOL;                                                // departe → elibereaza
      }
    }
  }, { rootMargin: '1200px 0px', threshold: 0 });

  grid.innerHTML = '';
  poze.forEach((p, i) => {
    const a = document.createElement('a');
    a.className = 'gallery-item';
    a.href = adresa(p.storage_key);
    a.setAttribute('aria-label', 'Deschide poza');
    const dim = p.width && p.height ? `width="${p.width}" height="${p.height}"` : '';
    a.innerHTML = `<img alt="Rise Up" ${dim} data-src="${adresa(p.thumb_key || p.storage_key)}" src="${GOL}">`;
    a.addEventListener('click', (e) => { e.preventDefault(); vizualizator(i); });
    grid.appendChild(a);
    observator.observe(a.querySelector('img'));
  });
}

/** Pozele noi (si stergerile) apar live, fara refresh. */
function asculta() {
  sb.channel('poze-noi')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos' }, (m) => {
      if (poze.some((p) => p.id === m.new.id)) return;   // poate a prins-o deja polling-ul
      poze.unshift(m.new);
      deseneaza();
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'photos' }, (m) => {
      const k = poze.findIndex((p) => p.id === m.old.id);
      if (k > -1) poze.splice(k, 1);
      deseneaza();
    })
    .subscribe();
}

/**
 * Plasa de siguranta peste Realtime: chiar daca abonarea de mai sus nu
 * porneste (Realtime oprit pe proiect, retea capricioasa pe telefon),
 * reluam lista periodic si cand utilizatorul revine pe tab. Redesenam
 * doar cand chiar s-a schimbat ceva, ca sa nu palpaie grila degeaba.
 */
const RESINCRONIZARE_MS = 15000;
let seSincronizeaza = false;

const aceeasiLista = (a, b) =>
  a.length === b.length && a.every((p, k) => p.id === b[k].id);

async function resincronizeaza() {
  if (seSincronizeaza) return;                 // una deja in curs
  if (document.hidden) return;                 // tab in fundal — n-are rost
  if (document.querySelector('.vz')) return;   // poza deschisa — nu-i mutam indexul
  seSincronizeaza = true;
  try {
    const data = await preiaPoze();
    if (data === null || aceeasiLista(data, poze)) return;
    poze.splice(0, poze.length, ...data);
    deseneaza();
  } finally {
    seSincronizeaza = false;
  }
}

function autoActualizare() {
  setInterval(resincronizeaza, RESINCRONIZARE_MS);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resincronizeaza();   // ai revenit pe tab → verifica acum
  });
  window.addEventListener('focus', resincronizeaza);
  window.addEventListener('online', resincronizeaza);
}

/**
 * Sterge o poza: intai fisierele din R2, apoi randul din baza.
 * In ordinea asta — daca pica stergerea din R2, randul ramane si
 * poza e in continuare vizibila, deci putem reincerca. Invers am
 * ramane cu fisiere orfane in bucket, invizibile si de negasit.
 */
async function stergePoza(p) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('sesiune expirată');

  const antet = { Authorization: `Bearer ${session.access_token}` };
  for (const cheie of [p.storage_key, p.thumb_key].filter(Boolean)) {
    const r = await fetch(adresa(cheie), { method: 'DELETE', headers: antet });
    if (!r.ok && r.status !== 404) throw new Error(`nu s-a putut șterge fișierul (${r.status})`);
  }

  const { error } = await sb.from('photos').delete().eq('id', p.id);
  if (error) throw new Error(error.message);

  const k = poze.findIndex((x) => x.id === p.id);
  if (k > -1) poze.splice(k, 1);   // pe loc: vizualizatorul tine aceeasi lista
  deseneaza();
}

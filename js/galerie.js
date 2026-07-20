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

async function incarca() {
  const { data, error } = await sb
    .from('photos')
    .select('id,storage_key,thumb_key,width,height,size_bytes,day_tag,created_at')
    .order('created_at', { ascending: false });

  if (error) { console.error('[galerie]', error.message); return; }
  poze.splice(0, poze.length, ...(data || []));
  potSterge = await esteFotograf().catch(() => false);
  deseneaza();
  asculta();
}

function deseneaza() {
  if (!poze.length) {          // nicio poza inca → ramane "Coming soon"
    sectiune.hidden = true;
    if (comingSoon) comingSoon.hidden = false;
    return;
  }
  if (comingSoon) comingSoon.hidden = true;
  sectiune.hidden = false;

  grid.innerHTML = '';
  poze.forEach((p, i) => {
    const a = document.createElement('a');
    a.className = 'gallery-item';
    a.href = adresa(p.storage_key);
    a.setAttribute('aria-label', 'Deschide poza');
    a.innerHTML = `<img src="${adresa(p.thumb_key || p.storage_key)}" alt="Rise Up" loading="lazy"
                        ${p.width && p.height ? `width="${p.width}" height="${p.height}"` : ''}>`;
    a.addEventListener('click', (e) => { e.preventDefault(); vizualizator(i); });
    grid.appendChild(a);
  });
}

/** Pozele noi (si stergerile) apar live, fara refresh. */
function asculta() {
  sb.channel('poze-noi')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos' }, (m) => {
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

/**
 * Galeria publica.
 *
 * Oricine o vede, fara cont. Grid-ul foloseste thumbnail-uri (mici,
 * se incarca rapid pe telefon), iar la click se deschide originalul.
 *
 * Cat timp nu exista nicio poza, ramane blocul "Coming soon" din
 * pagina — nu trebuie sa editezi nimic manual in ziua taberei.
 */

import { sb } from './login-ascuns.js';
import { WORKER_URL } from './config.js';

const comingSoon = document.querySelector('.coming-soon')?.closest('section');
const sectiune   = document.getElementById('galerie-reala');
const grid       = document.getElementById('galerie-grid');

let poze = [];

/** Calea din R2 → adresa completa. Construita aici, nu salvata in baza. */
const adresa = (cheie) => `${WORKER_URL}/f/${cheie}`;

incarca();

async function incarca() {
  const { data, error } = await sb
    .from('photos')
    .select('id,storage_key,thumb_key,width,height,day_tag,created_at')
    .order('created_at', { ascending: false });

  if (error) { console.error('[galerie]', error.message); return; }
  poze = data || [];
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
    a.addEventListener('click', (e) => { e.preventDefault(); lightbox(i); });
    grid.appendChild(a);
  });
}

/** Pozele noi apar live, fara refresh, cat timp fotograful incarca. */
function asculta() {
  sb.channel('poze-noi')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'photos' }, (m) => {
      poze.unshift(m.new);
      deseneaza();
    })
    .subscribe();
}

/* ─────────── LIGHTBOX ─────────── */

function lightbox(pozitia) {
  let i = pozitia;

  const box = document.createElement('div');
  box.className = 'lb-fundal';
  box.innerHTML = `
    <button class="lb-inchide" aria-label="Închide">&times;</button>
    <button class="lb-nav lb-inapoi" aria-label="Poza anterioară">&#8249;</button>
    <figure class="lb-cadru"><img alt="Rise Up"></figure>
    <button class="lb-nav lb-inainte" aria-label="Poza următoare">&#8250;</button>
    <a class="btn btn-fire lb-descarca" download>Descarcă</a>`;
  document.body.appendChild(box);
  document.body.style.overflow = 'hidden';

  const img = box.querySelector('img');
  const link = box.querySelector('.lb-descarca');

  const arata = () => {
    const p = poze[i];
    const plin = adresa(p.storage_key);
    img.src = plin;
    link.href = plin;
    const ext = p.storage_key.split('.').pop() || 'jpg';
    link.download = `rise-up-${(p.created_at || '').slice(0, 10)}-${p.id.slice(0, 8)}.${ext}`;
  };
  const muta = (d) => { i = (i + d + poze.length) % poze.length; arata(); };
  const inchide = () => {
    box.remove();
    document.body.style.overflow = '';
    document.removeEventListener('keydown', taste);
  };
  function taste(e) {
    if (e.key === 'Escape') inchide();
    if (e.key === 'ArrowLeft') muta(-1);
    if (e.key === 'ArrowRight') muta(1);
  }

  box.querySelector('.lb-inchide').onclick = inchide;
  box.querySelector('.lb-inapoi').onclick = () => muta(-1);
  box.querySelector('.lb-inainte').onclick = () => muta(1);
  box.onclick = (e) => { if (e.target === box) inchide(); };
  document.addEventListener('keydown', taste);

  arata();
}

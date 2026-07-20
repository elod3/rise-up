/**
 * Galeria publica.
 *
 * Oricine o vede, fara cont. Grid-ul foloseste thumbnail-uri (mici,
 * se incarca rapid pe telefon), iar la click se deschide originalul.
 *
 * Cat timp nu exista nicio poza, ramane blocul "Coming soon" din
 * pagina — nu trebuie sa editezi nimic manual in ziua taberei.
 */

import { sb, esteFotograf } from './login-ascuns.js';
import { WORKER_URL } from './config.js';

const comingSoon = document.querySelector('.coming-soon')?.closest('section');
const sectiune   = document.getElementById('galerie-reala');
const grid       = document.getElementById('galerie-grid');

let poze = [];
let potSterge = false;   // devine true daca fotograful e logat

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
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'photos' }, (m) => {
      poze = poze.filter((p) => p.id !== m.old.id);
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
    <div class="lb-actiuni">
      <a class="btn btn-fire lb-descarca">Descarcă</a>
      ${potSterge ? '<button class="btn btn-ghost lb-sterge">Șterge</button>' : ''}
    </div>`;
  document.body.appendChild(box);
  document.body.style.overflow = 'hidden';

  const img = box.querySelector('img');
  const link = box.querySelector('.lb-descarca');

  const arata = () => {
    const p = poze[i];
    img.src = adresa(p.storage_key);

    // Descarcarea o cere Worker-ul prin ?dl=1 — atributul "download" din
    // HTML e ignorat de browser cand fisierul vine de pe alt domeniu.
    const ext = p.storage_key.split('.').pop() || 'jpg';
    const nume = `rise-up-${(p.created_at || '').slice(0, 10)}-${p.id.slice(0, 8)}.${ext}`;
    link.href = `${adresa(p.storage_key)}?dl=1&nume=${encodeURIComponent(nume)}`;
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

  // Stergere — doar pentru fotograf, si numai dupa o confirmare.
  const btnSterge = box.querySelector('.lb-sterge');
  if (btnSterge) {
    let sigur = false;
    btnSterge.onclick = async () => {
      if (!sigur) {
        sigur = true;
        btnSterge.textContent = 'Sigur? Apasă din nou';
        btnSterge.classList.add('lb-sterge-sigur');
        setTimeout(() => {
          sigur = false;
          btnSterge.textContent = 'Șterge';
          btnSterge.classList.remove('lb-sterge-sigur');
        }, 4000);
        return;
      }
      btnSterge.disabled = true;
      btnSterge.textContent = 'Se șterge…';
      try {
        await stergePoza(poze[i]);          // scoate poza si din lista
        if (!poze.length) { inchide(); return; }   // era ultima din galerie
        i = i % poze.length;                // daca era ultima, sarim la prima
        arata();
        btnSterge.disabled = false;
        btnSterge.textContent = 'Șterge';
        btnSterge.classList.remove('lb-sterge-sigur');
        sigur = false;
      } catch (e) {
        btnSterge.textContent = 'Eroare: ' + e.message;
        btnSterge.disabled = false;
      }
    };
  }

  arata();
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
    if (!r.ok) throw new Error(`nu s-a putut șterge fișierul (${r.status})`);
  }

  const { error } = await sb.from('photos').delete().eq('id', p.id);
  if (error) throw new Error(error.message);

  poze = poze.filter((x) => x.id !== p.id);
  deseneaza();
}

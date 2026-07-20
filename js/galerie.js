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

const comingSoon = document.querySelector('.coming-soon')?.closest('section');
const sectiune   = document.getElementById('galerie-reala');
const grid       = document.getElementById('galerie-grid');

let poze = [];
let potSterge = false;

/** Calea din R2 → adresa completa. Construita aici, nu salvata in baza. */
const adresa = (cheie) => `${WORKER_URL}/f/${cheie}`;

const ICO = {
  inchide:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  inapoi:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  inainte:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  descarca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  sterge:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
};

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
      poze = poze.filter((p) => p.id !== m.old.id);
      deseneaza();
    })
    .subscribe();
}

/* ═════════════ VIZUALIZATOR ═════════════ */

function vizualizator(pozitia) {
  let i = pozitia;

  const box = document.createElement('div');
  box.className = 'vz';
  box.innerHTML = `
    <div class="vz-fundal"></div>

    <button class="vz-rotund vz-inchide" aria-label="Închide">${ICO.inchide}</button>
    <div class="vz-info"><span class="vz-pozitie"></span><span class="vz-eticheta"></span></div>

    <div class="vz-scena">
      <img class="vz-img" alt="Rise Up" draggable="false">
    </div>

    <button class="vz-rotund vz-sageata vz-inapoi" aria-label="Poza anterioară">${ICO.inapoi}</button>
    <button class="vz-rotund vz-sageata vz-inainte" aria-label="Poza următoare">${ICO.inainte}</button>

    <div class="vz-bara">
      <a class="vz-rotund vz-descarca" aria-label="Descarcă poza" title="Descarcă">${ICO.descarca}</a>
      ${potSterge ? `<button class="vz-rotund vz-sterge" aria-label="Șterge poza" title="Șterge">${ICO.sterge}</button>` : ''}
    </div>`;

  document.body.appendChild(box);
  document.body.style.overflow = 'hidden';
  requestAnimationFrame(() => box.classList.add('vz-deschis'));

  const scena    = box.querySelector('.vz-scena');
  const img      = box.querySelector('.vz-img');
  const link     = box.querySelector('.vz-descarca');
  const pozitieEl = box.querySelector('.vz-pozitie');
  const etichetaEl = box.querySelector('.vz-eticheta');

  /* ─── afisare ─── */

  const arata = (directie = 0) => {
    const p = poze[i];
    if (directie) {
      img.style.transition = 'none';
      img.style.transform = `translateX(${directie * 40}px)`;
      img.style.opacity = '0';
      requestAnimationFrame(() => {
        img.style.transition = '';
        img.style.transform = '';
        img.style.opacity = '';
      });
    }
    img.src = adresa(p.storage_key);

    // Descarcarea o cere Worker-ul prin ?dl=1 — atributul "download" din
    // HTML e ignorat de browser cand fisierul vine de pe alt domeniu.
    const ext = p.storage_key.split('.').pop() || 'jpg';
    const nume = `rise-up-${(p.created_at || '').slice(0, 10)}-${p.id.slice(0, 8)}.${ext}`;
    link.href = `${adresa(p.storage_key)}?dl=1&nume=${encodeURIComponent(nume)}`;

    pozitieEl.textContent = `${i + 1} / ${poze.length}`;
    etichetaEl.textContent = p.day_tag || '';
    box.classList.toggle('vz-singura', poze.length < 2);

    // Pregatim vecinii, ca swipe-ul sa fie instant.
    [poze[i + 1], poze[i - 1]].filter(Boolean).forEach((v) => {
      new Image().src = adresa(v.storage_key);
    });
  };

  const muta = (d) => {
    if (poze.length < 2) return;
    i = (i + d + poze.length) % poze.length;
    arata(d);
  };

  const inchide = () => {
    box.classList.remove('vz-deschis');
    document.body.style.overflow = '';
    document.removeEventListener('keydown', taste);
    setTimeout(() => box.remove(), 260);
  };

  function taste(e) {
    if (e.key === 'Escape') inchide();
    if (e.key === 'ArrowLeft') muta(-1);
    if (e.key === 'ArrowRight') muta(1);
  }

  box.querySelector('.vz-inchide').onclick = inchide;
  box.querySelector('.vz-inapoi').onclick = () => muta(-1);
  box.querySelector('.vz-inainte').onclick = () => muta(1);
  box.querySelector('.vz-fundal').onclick = inchide;
  document.addEventListener('keydown', taste);

  /* ─── swipe, ca in galeria telefonului ─── */

  let x0 = 0, y0 = 0, dx = 0, dy = 0, trage = false;

  scena.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    trage = true;
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
    img.style.transition = 'none';
  }, { passive: true });

  scena.addEventListener('touchmove', (e) => {
    if (!trage) return;
    dx = e.touches[0].clientX - x0;
    dy = e.touches[0].clientY - y0;

    if (Math.abs(dy) > Math.abs(dx)) {          // tras in jos → inchidere
      img.style.transform = `translateY(${dy}px) scale(${Math.max(0.86, 1 - Math.abs(dy) / 900)})`;
      box.style.setProperty('--vz-opac', String(Math.max(0.3, 1 - Math.abs(dy) / 450)));
    } else {                                     // tras lateral → alta poza
      const frana = poze.length < 2 ? 0.25 : 1;  // daca e singura, rezista
      img.style.transform = `translateX(${dx * frana}px)`;
    }
  }, { passive: true });

  scena.addEventListener('touchend', () => {
    if (!trage) return;
    trage = false;
    img.style.transition = '';
    box.style.removeProperty('--vz-opac');

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 110) { inchide(); dx = dy = 0; return; }
    if (Math.abs(dx) > 60) muta(dx < 0 ? 1 : -1);
    else { img.style.transform = ''; }
    dx = dy = 0;
  });

  /* ─── stergere (doar fotograf) ─── */

  const btnSterge = box.querySelector('.vz-sterge');
  if (btnSterge) {
    let sigur = null;
    btnSterge.onclick = async () => {
      if (!sigur) {
        btnSterge.classList.add('vz-sigur');
        sigur = setTimeout(() => { sigur = null; btnSterge.classList.remove('vz-sigur'); }, 4000);
        return;
      }
      clearTimeout(sigur); sigur = null;
      btnSterge.disabled = true;
      btnSterge.classList.add('vz-lucreaza');
      try {
        await stergePoza(poze[i]);
        if (!poze.length) { inchide(); return; }
        i = i % poze.length;
        arata();
        btnSterge.disabled = false;
        btnSterge.classList.remove('vz-sigur', 'vz-lucreaza');
      } catch (e) {
        btnSterge.disabled = false;
        btnSterge.classList.remove('vz-lucreaza');
        console.error('[stergere]', e);
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
    if (!r.ok && r.status !== 404) throw new Error(`nu s-a putut șterge fișierul (${r.status})`);
  }

  const { error } = await sb.from('photos').delete().eq('id', p.id);
  if (error) throw new Error(error.message);

  poze = poze.filter((x) => x.id !== p.id);
  deseneaza();
}

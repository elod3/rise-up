/**
 * Pagina de incarcare — doar pentru fotograf.
 *
 * Pentru fiecare poza:
 *   1. facem un thumbnail mic in browser (ca galeria sa se incarce rapid)
 *   2. trimitem originalul la Worker, care il pune in R2
 *   3. trimitem thumbnail-ul la fel
 *   4. adaugam randul in baza de date
 *
 * Mergem cu 3 poze deodata, nu toate — altfel se sufoca conexiunea.
 */

import { sb, esteFotograf } from './login-ascuns.js';
import { WORKER_URL } from './config.js';

const PARALEL   = 3;
const THUMB_MAX = 600;   // px pe latura lunga

const zona    = document.getElementById('zona');
const input   = document.getElementById('fisiere');
const lista   = document.getElementById('lista');
const stare   = document.getElementById('stare');
const ziTag   = document.getElementById('zi-tag');
const iesire  = document.getElementById('iesire');

let coada = [];
let active = 0;

/* ─────────── PAZA: doar fotograful intra ─────────── */

const { data: { session } } = await sb.auth.getSession();
if (!session || !(await esteFotograf())) {
  document.body.innerHTML = `
    <div class="up-refuz">
      <h1 class="fire-text">Zonă restricționată</h1>
      <p>Pagina asta e doar pentru fotograful taberei.</p>
      <a class="btn btn-fire" href="index.html">Înapoi la site</a>
    </div>`;
  throw new Error('acces refuzat');
}

document.getElementById('cine').textContent = session.user.email;
iesire.onclick = async () => { await sb.auth.signOut(); location.href = 'index.html'; };

/* ─────────── PRIMIREA FISIERELOR ─────────── */

zona.addEventListener('click', () => input.click());
input.addEventListener('change', () => adauga([...input.files]));

['dragenter', 'dragover'].forEach((ev) =>
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.add('peste'); }));
['dragleave', 'drop'].forEach((ev) =>
  zona.addEventListener(ev, (e) => { e.preventDefault(); zona.classList.remove('peste'); }));

zona.addEventListener('drop', (e) => adauga([...e.dataTransfer.files]));

function adauga(fisiere) {
  const poze = fisiere.filter((f) => f.type.startsWith('image/'));
  const sarite = fisiere.length - poze.length;
  if (sarite) mesaj(`${sarite} fișier(e) ignorate — nu sunt imagini.`);

  poze.forEach((fisier) => {
    const rand = randNou(fisier.name);
    coada.push({ fisier, rand });
  });
  porneste();
}

function porneste() {
  while (active < PARALEL && coada.length) {
    const treaba = coada.shift();
    active++;
    urca(treaba).finally(() => { active--; porneste(); numara(); });
  }
  numara();
}

/* ─────────── O POZA ─────────── */

async function urca({ fisier, rand }) {
  const bara = rand.querySelector('.up-bara span');
  const text = rand.querySelector('.up-stare');
  const setare = (pct, t) => { bara.style.width = pct + '%'; if (t) text.textContent = t; };

  try {
    setare(5, 'se pregătește…');
    const id = crypto.randomUUID();
    const ext = (fisier.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');

    const { latime, inaltime, thumb } = await pregateste(fisier);

    setare(15, 'se trimite originalul…');
    const original = await trimite(fisier, { kind: 'original', id, ext }, fisier.type,
      (p) => setare(15 + p * 0.65));

    let cheieThumb = null;
    if (thumb) {
      setare(85, 'se trimite miniatura…');
      const t = await trimite(thumb, { kind: 'thumb', id, ext: 'jpg' }, 'image/jpeg');
      cheieThumb = t.key;
    }

    setare(95, 'se salvează…');
    const { error } = await sb.from('photos').insert({
      storage_key: original.key,
      thumb_key: cheieThumb,
      content_type: fisier.type,
      size_bytes: fisier.size,
      width: latime,
      height: inaltime,
      day_tag: ziTag.value.trim() || null,
      uploaded_by: session.user.id,
    });
    if (error) throw new Error(error.message);

    setare(100, 'gata ✓');
    rand.classList.add('gata');
  } catch (e) {
    rand.classList.add('esuat');
    text.textContent = 'eroare: ' + e.message;
    const din_nou = document.createElement('button');
    din_nou.className = 'up-reia';
    din_nou.textContent = 'Reîncearcă';
    din_nou.onclick = () => {
      rand.classList.remove('esuat');
      din_nou.remove();
      coada.push({ fisier, rand });
      porneste();
    };
    rand.appendChild(din_nou);
  }
}

/**
 * Trimite un fisier la Worker, cu progres real.
 *
 * Cerem token-ul proaspat de fiecare data: cel de la pornirea paginii
 * expira dupa o ora, iar o sesiune lunga de incarcat poze trece usor
 * de o ora. Supabase il reinnoieste singur in fundal.
 */
async function trimite(corp, parametri, tip, laProgres) {
  const { data: { session: acum } } = await sb.auth.getSession();
  if (!acum) throw new Error('sesiune expirată — reintră în cont');

  return new Promise((rezolva, respinge) => {
    const q = new URLSearchParams(parametri);
    const x = new XMLHttpRequest();
    x.open('POST', `${WORKER_URL}/upload?${q}`);
    x.setRequestHeader('Authorization', `Bearer ${acum.access_token}`);
    x.setRequestHeader('Content-Type', tip);
    x.upload.onprogress = (e) => {
      if (e.lengthComputable && laProgres) laProgres((e.loaded / e.total) * 100);
    };
    x.onload = () => {
      let r = {};
      try { r = JSON.parse(x.responseText); } catch {}
      x.status === 200 ? rezolva(r) : respinge(new Error(r.error || `HTTP ${x.status}`));
    };
    x.onerror = () => respinge(new Error('conexiune întreruptă'));
    x.send(corp);
  });
}

/** Citeste dimensiunile si face thumbnail-ul. */
async function pregateste(fisier) {
  try {
    const bitmap = await createImageBitmap(fisier);
    const { width: latime, height: inaltime } = bitmap;

    const scara = Math.min(1, THUMB_MAX / Math.max(latime, inaltime));
    const c = document.createElement('canvas');
    c.width = Math.round(latime * scara);
    c.height = Math.round(inaltime * scara);
    c.getContext('2d').drawImage(bitmap, 0, 0, c.width, c.height);
    bitmap.close();

    const thumb = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.82));
    return { latime, inaltime, thumb };
  } catch {
    // Unele formate (HEIC de pe iPhone) nu pot fi citite de browser.
    // Urcam originalul si folosim tot originalul in grid.
    return { latime: null, inaltime: null, thumb: null };
  }
}

/* ─────────── INTERFATA ─────────── */

function randNou(nume) {
  const el = document.createElement('li');
  el.className = 'up-rand';
  el.innerHTML = `
    <span class="up-nume">${nume.replace(/[<>&]/g, '')}</span>
    <span class="up-bara"><span></span></span>
    <span class="up-stare">în așteptare…</span>`;
  lista.appendChild(el);
  return el;
}

function numara() {
  const gata = lista.querySelectorAll('.gata').length;
  const total = lista.children.length;
  stare.textContent = total ? `${gata} din ${total} urcate` : '';
}

function mesaj(t) { stare.textContent = t; }

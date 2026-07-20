/**
 * Dashboard-ul fotografului — administrarea pozelor deja urcate.
 *
 * Ce se poate face aici:
 *   • vezi toate pozele, cu data si eticheta lor
 *   • schimbi eticheta zilei ("Ziua 1", "Foc de tabără"…)
 *   • stergi o poza sau mai multe deodata
 *
 * Stergerea scoate si fisierele din R2, nu doar randul din baza.
 */

import { sb } from './login-ascuns.js';
import { WORKER_URL } from './config.js';

const adresa = (cheie) => `${WORKER_URL}/f/${cheie}`;

let poze = [];
let alese = new Set();

const grila   = document.getElementById('db-grila');
const numar   = document.getElementById('db-numar');
const bara    = document.getElementById('db-bara');
const btnSel  = document.getElementById('db-sterge-alese');
const btnTot  = document.getElementById('db-toate');

export async function porneste() {
  btnSel.addEventListener('click', stergeAlese);
  btnTot.addEventListener('click', comutaToate);
  await reincarca();
}

export async function reincarca() {
  const { data, error } = await sb
    .from('photos')
    .select('id,storage_key,thumb_key,day_tag,size_bytes,created_at')
    .order('created_at', { ascending: false });

  if (error) { numar.textContent = 'Eroare: ' + error.message; return; }
  poze = data || [];
  alese.clear();
  deseneaza();
}

function deseneaza() {
  numar.textContent = poze.length
    ? `${poze.length} ${poze.length === 1 ? 'poză' : 'poze'} · ${marime(poze.reduce((s, p) => s + (p.size_bytes || 0), 0))}`
    : 'Nicio poză încărcată încă.';

  bara.hidden = alese.size === 0;
  btnSel.textContent = `Șterge ${alese.size} ${alese.size === 1 ? 'poză' : 'poze'}`;
  btnTot.textContent = alese.size === poze.length && poze.length ? 'Deselectează tot' : 'Selectează tot';

  grila.innerHTML = '';
  poze.forEach((p) => {
    const cel = document.createElement('div');
    cel.className = 'db-poza' + (alese.has(p.id) ? ' aleasa' : '');
    cel.innerHTML = `
      <label class="db-bifa">
        <input type="checkbox" ${alese.has(p.id) ? 'checked' : ''}>
        <img src="${adresa(p.thumb_key || p.storage_key)}" alt="" loading="lazy">
      </label>
      <div class="db-jos">
        <input class="db-eticheta" type="text" maxlength="40" placeholder="fără etichetă"
               value="${(p.day_tag || '').replace(/"/g, '&quot;')}">
        <div class="db-meta">
          <span>${new Date(p.created_at).toLocaleDateString('ro-RO', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          <button class="db-sterge" title="Șterge poza">Șterge</button>
        </div>
      </div>`;

    cel.querySelector('input[type=checkbox]').addEventListener('change', (e) => {
      e.target.checked ? alese.add(p.id) : alese.delete(p.id);
      deseneaza();
    });

    // Eticheta se salveaza cand iesi din camp sau apesi Enter.
    const eticheta = cel.querySelector('.db-eticheta');
    eticheta.addEventListener('change', () => salveazaEticheta(p, eticheta));
    eticheta.addEventListener('keydown', (e) => { if (e.key === 'Enter') eticheta.blur(); });

    cel.querySelector('.db-sterge').addEventListener('click', (e) => confirmaStergerea(e.target, p));

    grila.appendChild(cel);
  });
}

async function salveazaEticheta(p, camp) {
  const noua = camp.value.trim() || null;
  if (noua === (p.day_tag || null)) return;

  camp.classList.add('salveaza');
  const { error } = await sb.from('photos').update({ day_tag: noua }).eq('id', p.id);
  camp.classList.remove('salveaza');

  if (error) {
    camp.classList.add('eroare');
    camp.value = p.day_tag || '';
    setTimeout(() => camp.classList.remove('eroare'), 2000);
    return;
  }
  p.day_tag = noua;
  camp.classList.add('salvat');
  setTimeout(() => camp.classList.remove('salvat'), 1200);
}

/** Prima apasare intreaba, a doua sterge. Se anuleaza singur dupa 4s. */
function confirmaStergerea(buton, p) {
  if (buton.dataset.sigur !== '1') {
    buton.dataset.sigur = '1';
    buton.textContent = 'Sigur?';
    buton.classList.add('sigur');
    setTimeout(() => {
      buton.dataset.sigur = '0';
      buton.textContent = 'Șterge';
      buton.classList.remove('sigur');
    }, 4000);
    return;
  }
  buton.disabled = true;
  buton.textContent = '…';
  sterge([p])
    .then(reincarca)
    .catch((e) => { buton.disabled = false; buton.textContent = 'Eroare'; console.error(e); });
}

async function stergeAlese() {
  const lot = poze.filter((p) => alese.has(p.id));
  if (!lot.length) return;

  if (btnSel.dataset.sigur !== '1') {
    btnSel.dataset.sigur = '1';
    btnSel.textContent = `Sigur? Șterge ${lot.length}`;
    btnSel.classList.add('sigur');
    setTimeout(() => {
      btnSel.dataset.sigur = '0';
      btnSel.classList.remove('sigur');
      deseneaza();
    }, 4000);
    return;
  }

  btnSel.disabled = true;
  btnSel.textContent = 'Se șterg…';
  try {
    await sterge(lot);
  } catch (e) {
    alert('Nu s-au putut șterge toate: ' + e.message);
  }
  btnSel.disabled = false;
  btnSel.dataset.sigur = '0';
  btnSel.classList.remove('sigur');
  await reincarca();
}

/** Intai fisierele din R2, apoi randurile din baza — ca sa nu ramana orfani. */
async function sterge(lot) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) throw new Error('sesiune expirată');
  const antet = { Authorization: `Bearer ${session.access_token}` };

  for (const p of lot) {
    for (const cheie of [p.storage_key, p.thumb_key].filter(Boolean)) {
      const r = await fetch(adresa(cheie), { method: 'DELETE', headers: antet });
      if (!r.ok && r.status !== 404) throw new Error(`fișier neșters (${r.status})`);
    }
  }

  const { error } = await sb.from('photos').delete().in('id', lot.map((p) => p.id));
  if (error) throw new Error(error.message);
}

function comutaToate() {
  alese = alese.size === poze.length ? new Set() : new Set(poze.map((p) => p.id));
  deseneaza();
}

function marime(octeti) {
  if (!octeti) return '0 MB';
  const mb = octeti / 1048576;
  return mb >= 1024 ? (mb / 1024).toFixed(2) + ' GB' : mb.toFixed(1) + ' MB';
}

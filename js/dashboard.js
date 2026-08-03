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
  montatCostEasterEgg();
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

/* ─────────── EASTER EGG: cost storage R2 ───────────
 * 4 apasari rapide pe butonul "Acasă" din dashboard arata cat costa
 * spatiul ocupat pe Cloudflare R2. Un click normal duce acasa ca de obicei
 * (cu o mica intarziere, ca sa apucam sa numaram apasarile). Preturi R2:
 * 0.015 $/GB/luna, primele 10 GB gratis, traficul/descarcarile gratis. */

const R2_PRET_GB_LUNA = 0.015;   // USD / GB / luna
const R2_GB_GRATIS    = 10;      // primele 10 GB/luna sunt gratis
const USD_RON         = 4.6;     // curs aproximativ, doar pt. orientare
const THUMB_EST_KB    = 60;      // nu tinem marimea miniaturii in baza -> estimam

function montatCostEasterEgg() {
  const buton = document.querySelector('.db-acasa');
  if (!buton) return;
  injecteazaStilEgg();

  let apasari = 0, ceas = null;
  buton.addEventListener('click', (e) => {
    e.preventDefault();            // nu plecam imediat: poate urmeaza inca 3 apasari
    apasari++;
    clearTimeout(ceas);
    if (apasari >= 4) { apasari = 0; arataCostR2(); return; }
    ceas = setTimeout(() => {      // mai putin de 4 -> comportament normal: mergi acasa
      apasari = 0;
      location.href = buton.getAttribute('href') || 'index.html';
    }, 320);
  });
}

function arataCostR2() {
  const octetiOrig  = poze.reduce((s, p) => s + (p.size_bytes || 0), 0);
  const nrThumbs    = poze.filter((p) => p.thumb_key).length;
  const octetiThumb = nrThumbs * THUMB_EST_KB * 1024;
  const octetiTotal = octetiOrig + octetiThumb;
  const gbTotal     = octetiTotal / 1073741824;
  const costPlin    = gbTotal * R2_PRET_GB_LUNA;                          // fara prag
  const costReal    = Math.max(0, gbTotal - R2_GB_GRATIS) * R2_PRET_GB_LUNA; // cu 10 GB gratis

  const usd = (v) => '$' + v.toFixed(v < 1 ? 4 : 2);
  const lei = (v) => (v * USD_RON).toFixed(2) + ' lei';

  const fond = document.createElement('div');
  fond.className = 'egg-cost';
  fond.innerHTML = `
    <div class="egg-card" role="dialog" aria-label="Cost storage R2">
      <button class="egg-inchide" aria-label="Închide">×</button>
      <h3>💰 Cost storage R2</h3>
      <div class="egg-rand"><span>Poze (originale)</span><b>${poze.length} · ${marime(octetiOrig)}</b></div>
      <div class="egg-rand"><span>Miniaturi (est.)</span><b>${nrThumbs} · ${marime(octetiThumb)}</b></div>
      <div class="egg-rand egg-total"><span>Total în R2</span><b>≈ ${marime(octetiTotal)}</b></div>
      <div class="egg-cost-mare">${costReal <= 0 ? '0 $ / lună' : usd(costReal) + ' / lună'}</div>
      <div class="egg-sub">${costReal <= 0
        ? `sub pragul gratuit de ${R2_GB_GRATIS} GB/lună 🎉`
        : `≈ ${lei(costReal)} / lună`}</div>
      <div class="egg-nota">
        Fără pragul gratuit ar fi <b>${usd(costPlin)}/lună</b> (${lei(costPlin)}).<br>
        R2: $0.015/GB/lună · primele ${R2_GB_GRATIS} GB gratis · descărcările/traficul = <b>gratis</b>.
      </div>
    </div>`;

  const inchide = () => fond.remove();
  fond.addEventListener('click', (e) => { if (e.target === fond) inchide(); });
  fond.querySelector('.egg-inchide').addEventListener('click', inchide);
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { inchide(); document.removeEventListener('keydown', esc); }
  });
  document.body.appendChild(fond);
}

function injecteazaStilEgg() {
  if (document.getElementById('egg-cost-stil')) return;
  const s = document.createElement('style');
  s.id = 'egg-cost-stil';
  s.textContent = `
  .egg-cost{position:fixed;inset:0;z-index:2000;display:grid;place-items:center;
    background:rgba(3,5,9,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);
    animation:egg-in .18s ease}
  @keyframes egg-in{from{opacity:0}to{opacity:1}}
  .egg-card{position:relative;width:min(92vw,360px);padding:22px 22px 18px;border-radius:18px;
    background:rgba(20,24,33,.97);border:1px solid rgba(255,255,255,.12);
    box-shadow:0 20px 60px rgba(0,0,0,.5);color:#fff;
    animation:egg-pop .22s cubic-bezier(.22,.9,.3,1)}
  @keyframes egg-pop{from{transform:scale(.9);opacity:0}to{transform:scale(1);opacity:1}}
  .egg-card h3{margin:0 0 14px;font-size:17px;font-weight:700}
  .egg-inchide{position:absolute;top:8px;right:12px;background:none;border:none;
    color:rgba(255,255,255,.6);font-size:26px;line-height:1;cursor:pointer;padding:0}
  .egg-inchide:hover{color:#fff}
  .egg-rand{display:flex;justify-content:space-between;gap:12px;padding:7px 0;font-size:13.5px;
    color:rgba(255,255,255,.75);border-bottom:1px solid rgba(255,255,255,.07)}
  .egg-rand b{color:#fff;font-weight:600;white-space:nowrap}
  .egg-total b{color:#ffb27a}
  .egg-cost-mare{margin:16px 0 2px;text-align:center;font-size:30px;font-weight:800;
    background:linear-gradient(90deg,#ff7a3c,#ffb27a);-webkit-background-clip:text;
    background-clip:text;-webkit-text-fill-color:transparent}
  .egg-sub{text-align:center;font-size:13px;color:rgba(255,255,255,.7);margin-bottom:14px}
  .egg-nota{font-size:11.5px;line-height:1.55;color:rgba(255,255,255,.5);
    border-top:1px solid rgba(255,255,255,.09);padding-top:12px}
  .egg-nota b{color:rgba(255,255,255,.8)}`;
  document.head.appendChild(s);
}

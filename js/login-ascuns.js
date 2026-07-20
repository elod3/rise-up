/**
 * Login ascuns pentru fotograf.
 *
 * Nu exista buton de "Login" nicaieri. Fotograful apasa de 4 ori
 * rapid pe logo-ul din bara de sus si-i apare formularul.
 *
 * Un vizitator obisnuit da un singur click si ajunge pe pagina
 * principala, ca de obicei — nu banuieste nimic.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const NECESARE  = 4;     // cate click-uri
const FEREASTRA = 2000;  // ms intre click-uri; peste asta, contorul se reseteaza
const INTARZIERE = 350;  // ms de asteptare inainte sa mergem "acasa"

let contor = 0;
let ultimul = 0;
let asteptare = null;

document.querySelectorAll('.nav-brand').forEach((logo) => {
  logo.addEventListener('click', (e) => {
    const acum = Date.now();
    contor = acum - ultimul > FEREASTRA ? 1 : contor + 1;
    ultimul = acum;

    // Oprim navigarea ca sa putem numara. Daca nu se aduna 4 click-uri,
    // mergem acasa oricum dupa 350ms — imperceptibil pentru vizitator.
    e.preventDefault();
    clearTimeout(asteptare);

    if (contor >= NECESARE) {
      contor = 0;
      deschideLogin();
      return;
    }
    asteptare = setTimeout(() => { location.href = logo.href; }, INTARZIERE);
  });
});

async function deschideLogin() {
  // Daca e deja logat si e fotograf, il ducem direct la incarcare.
  const { data: { session } } = await sb.auth.getSession();
  if (session && (await esteFotograf())) { location.href = 'upload.html'; return; }

  if (document.getElementById('login-ascuns')) return;  // deja deschis

  const fundal = document.createElement('div');
  fundal.id = 'login-ascuns';
  fundal.className = 'lg-fundal';
  fundal.innerHTML = `
    <form class="lg-cutie" autocomplete="on">
      <button type="button" class="lg-inchide" aria-label="Închide">&times;</button>
      <h3 class="fire-text">Zonă fotograf</h3>
      <label>Email<input type="email" name="email" required autocomplete="username"></label>
      <label>Parolă<input type="password" name="parola" required autocomplete="current-password"></label>
      <p class="lg-eroare" hidden></p>
      <button class="btn btn-fire" type="submit">Intră</button>
    </form>`;
  document.body.appendChild(fundal);
  fundal.querySelector('input').focus();

  const inchide = () => fundal.remove();
  fundal.querySelector('.lg-inchide').onclick = inchide;
  fundal.onclick = (e) => { if (e.target === fundal) inchide(); };
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { inchide(); document.removeEventListener('keydown', esc); }
  });

  fundal.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const buton = e.target.querySelector('button[type=submit]');
    const eroare = fundal.querySelector('.lg-eroare');
    buton.disabled = true;
    buton.textContent = 'Se verifică…';
    eroare.hidden = true;

    const { error } = await sb.auth.signInWithPassword({
      email: e.target.email.value.trim(),
      password: e.target.parola.value,
    });

    if (error || !(await esteFotograf())) {
      if (!error) await sb.auth.signOut();  // logat, dar fara drepturi
      eroare.textContent = error ? 'Email sau parolă greșită.' : 'Contul nu are drept de încărcare.';
      eroare.hidden = false;
      buton.disabled = false;
      buton.textContent = 'Intră';
      return;
    }
    location.href = 'upload.html';
  });
}

/** Intreaba baza ce rol are userul logat. RLS ii da doar propriul rand. */
export async function esteFotograf() {
  const { data } = await sb.from('profiles').select('role').limit(1).maybeSingle();
  return data?.role === 'photographer';
}

/**
 * Daca fotograful e logat, ii punem un link "Dashboard" in meniu.
 * Vizitatorii obisnuiti nu-l primesc niciodata — linkul nici macar
 * nu exista in HTML, se adauga din JS doar dupa ce verificam rolul.
 *
 * Sesiunea se pastreaza in browser, deci ramane logat si maine.
 */
(async function linkDashboard() {
  if (location.pathname.endsWith('upload.html')) return;   // e deja acolo

  const { data: { session } } = await sb.auth.getSession();
  if (!session || !(await esteFotograf())) return;

  const meniu = document.querySelector('.nav-links');
  if (meniu && !meniu.querySelector('.nav-dashboard')) {
    const li = document.createElement('li');
    li.innerHTML = '<a class="nav-dashboard" href="upload.html">Dashboard</a>';
    meniu.appendChild(li);
  }

  const mobil = document.getElementById('mobile-menu');
  if (mobil && !mobil.querySelector('.nav-dashboard')) {
    const a = document.createElement('a');
    a.className = 'nav-dashboard';
    a.href = 'upload.html';
    a.textContent = 'Dashboard';
    mobil.insertBefore(a, mobil.querySelector('.m-cta'));
  }
})();

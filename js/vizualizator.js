/**
 * Vizualizatorul de poze — se poarta ca galeria din telefon.
 *
 *   • poza pe tot ecranul, peste tot site-ul (inclusiv peste navbar)
 *   • swipe stanga/dreapta → poza urmatoare / anterioara
 *   • swipe in jos          → inchide
 *   • pinch cu doua degete  → zoom; dublu-tap → zoom rapid
 *   • cand e marita, degetul o plimba in loc s-o schimbe
 *   • un tap simplu ascunde/arata butoanele, ca sa vezi poza curata
 *
 * Folosim Pointer Events (nu touch), pentru ca merg la fel pe telefon,
 * pe desktop si cu stylus, si ne dau pinch-ul fara batai de cap.
 */

const ICO = {
  inchide:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
  inapoi:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
  inainte:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
  descarca: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>',
  meniu:    '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.9"/><circle cx="12" cy="12" r="1.9"/><circle cx="12" cy="19" r="1.9"/></svg>',
  sterge:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
  detalii:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 16v-4M12 8h.01"/></svg>',
};

const ZOOM_MAX = 4;
const ZOOM_TAP = 2.5;   // cat mareste dublu-tap-ul

/**
 * @param {object} optiuni
 *   poze        - lista de poze
 *   pornireLa   - indexul de la care deschidem
 *   adresa      - (cheie) => URL
 *   potSterge   - arata butonul de stergere?
 *   laStergere  - async (poza) => void
 *   laSchimbare - () => void  (dupa stergere, ca sa se redeseneze grila)
 */
export function deschide({ poze, pornireLa, adresa, potSterge, laStergere }) {
  let i = pornireLa;

  const box = document.createElement('div');
  box.className = 'vz';
  box.innerHTML = `
    <div class="vz-fundal"></div>

    <div class="vz-sus">
      <button class="vz-rotund vz-inchide" aria-label="Închide">${ICO.inchide}</button>
      <div class="vz-mijloc"><span class="vz-pozitie"></span><span class="vz-eticheta"></span></div>
      <div class="vz-dreapta">
        <a class="vz-rotund vz-descarca" aria-label="Descarcă poza" title="Descarcă">${ICO.descarca}</a>
        <button class="vz-rotund vz-meniu-btn" aria-label="Mai multe" aria-expanded="false">${ICO.meniu}</button>
      </div>
    </div>

    <div class="vz-meniu" hidden>
      <button class="vz-optiune vz-op-detalii">${ICO.detalii}<span>Detalii</span></button>
      ${potSterge ? `<button class="vz-optiune vz-op-sterge">${ICO.sterge}<span>Șterge poza</span></button>` : ''}
    </div>

    <div class="vz-scena">
      <img class="vz-img" alt="Rise Up" draggable="false">
    </div>

    <button class="vz-rotund vz-sageata vz-inapoi" aria-label="Poza anterioară">${ICO.inapoi}</button>
    <button class="vz-rotund vz-sageata vz-inainte" aria-label="Poza următoare">${ICO.inainte}</button>

    <div class="vz-detalii" hidden></div>`;

  document.body.appendChild(box);
  document.body.style.overflow = 'hidden';
  // Ascundem navbarul explicit. Doar z-index-ul nu ajunge: bara are
  // backdrop-filter, deci se vedea prin fundalul semi-transparent.
  document.documentElement.classList.add('vz-activ');
  requestAnimationFrame(() => box.classList.add('vz-deschis'));

  const scena     = box.querySelector('.vz-scena');
  const img       = box.querySelector('.vz-img');
  const link      = box.querySelector('.vz-descarca');
  const meniu     = box.querySelector('.vz-meniu');
  const btnMeniu  = box.querySelector('.vz-meniu-btn');
  const detalii   = box.querySelector('.vz-detalii');
  const pozitieEl = box.querySelector('.vz-pozitie');
  const etichetaEl = box.querySelector('.vz-eticheta');

  /* ═════ starea de zoom / deplasare ═════ */

  let scara = 1, tx = 0, ty = 0;

  const aplica = (animat = false) => {
    img.style.transition = animat ? 'transform .28s cubic-bezier(.22,.9,.3,1)' : 'none';
    img.style.transform = `translate(${tx}px, ${ty}px) scale(${scara})`;
    box.classList.toggle('vz-marit', scara > 1.01);
  };

  const resetZoom = (animat = true) => { scara = 1; tx = 0; ty = 0; aplica(animat); };

  /** Nu lasam poza sa fuga complet in afara ecranului cand e marita. */
  const limiteaza = () => {
    const r = img.getBoundingClientRect();
    const maxX = Math.max(0, (r.width - scena.clientWidth) / 2);
    const maxY = Math.max(0, (r.height - scena.clientHeight) / 2);
    tx = Math.min(maxX, Math.max(-maxX, tx));
    ty = Math.min(maxY, Math.max(-maxY, ty));
  };

  /* ═════ afisare ═════ */

  const arata = (directie = 0) => {
    const p = poze[i];
    resetZoom(false);

    if (directie) {
      img.style.transition = 'none';
      img.style.opacity = '0';
      img.style.transform = `translateX(${directie * 60}px)`;
      requestAnimationFrame(() => {
        img.style.transition = 'transform .3s cubic-bezier(.22,.9,.3,1), opacity .3s ease';
        img.style.opacity = '1';
        img.style.transform = 'translate(0px, 0px) scale(1)';
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

    inchideMeniu();
    detalii.hidden = true;

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
    document.documentElement.classList.remove('vz-activ');
    document.removeEventListener('keydown', taste);
    window.removeEventListener('pointermove', laMiscare);
    window.removeEventListener('pointerup', ridicat);
    window.removeEventListener('pointercancel', ridicat);
    setTimeout(() => box.remove(), 260);
  };

  function taste(e) {
    if (e.key === 'Escape') { if (!meniu.hidden) inchideMeniu(); else inchide(); }
    if (e.key === 'ArrowLeft') muta(-1);
    if (e.key === 'ArrowRight') muta(1);
  }
  document.addEventListener('keydown', taste);

  box.querySelector('.vz-inchide').onclick = inchide;
  box.querySelector('.vz-inapoi').onclick = () => muta(-1);
  box.querySelector('.vz-inainte').onclick = () => muta(1);

  /* ═════ meniul cu 3 puncte ═════ */

  function inchideMeniu() {
    meniu.hidden = true;
    btnMeniu.setAttribute('aria-expanded', 'false');
  }

  btnMeniu.onclick = (e) => {
    e.stopPropagation();
    meniu.hidden = !meniu.hidden;
    btnMeniu.setAttribute('aria-expanded', String(!meniu.hidden));
  };

  box.querySelector('.vz-op-detalii').onclick = () => {
    const p = poze[i];
    detalii.innerHTML = `
      <b>${new Date(p.created_at).toLocaleString('ro-RO', { dateStyle: 'long', timeStyle: 'short' })}</b>
      ${p.width && p.height ? `<span>${p.width} × ${p.height} px</span>` : ''}
      ${p.size_bytes ? `<span>${(p.size_bytes / 1048576).toFixed(1)} MB</span>` : ''}
      ${p.day_tag ? `<span>${p.day_tag}</span>` : ''}`;
    detalii.hidden = false;
    inchideMeniu();
    setTimeout(() => { detalii.hidden = true; }, 5000);
  };

  const opSterge = box.querySelector('.vz-op-sterge');
  if (opSterge) {
    let sigur = null;
    opSterge.onclick = async () => {
      if (!sigur) {
        opSterge.classList.add('vz-sigur');
        opSterge.querySelector('span').textContent = 'Sigur? Apasă din nou';
        sigur = setTimeout(() => {
          sigur = null;
          opSterge.classList.remove('vz-sigur');
          opSterge.querySelector('span').textContent = 'Șterge poza';
        }, 4000);
        return;
      }
      clearTimeout(sigur); sigur = null;
      opSterge.querySelector('span').textContent = 'Se șterge…';
      try {
        await laStergere(poze[i]);
        opSterge.classList.remove('vz-sigur');
        opSterge.querySelector('span').textContent = 'Șterge poza';
        if (!poze.length) { inchide(); return; }
        i = i % poze.length;
        arata();
      } catch (err) {
        opSterge.querySelector('span').textContent = 'Eroare la ștergere';
        console.error('[stergere]', err);
      }
    };
  }

  /* ═════ gesturi ═════ */

  const degete = new Map();
  let pinch0 = 0, scara0 = 1;
  let apucat = false, ax = 0, ay = 0, tx0 = 0, ty0 = 0;
  let ultimulTap = 0, miscat = false;

  const prinde = (v) => Math.min(ZOOM_MAX, Math.max(1, v));

  function laApasare(e) {
    degete.set(e.pointerId, { x: e.clientX, y: e.clientY });
    miscat = false;

    if (degete.size === 2) {
      const [a, b] = [...degete.values()];
      pinch0 = Math.hypot(b.x - a.x, b.y - a.y);
      scara0 = scara;
      apucat = false;
    } else if (degete.size === 1) {
      apucat = true;
      ax = e.clientX; ay = e.clientY;
      tx0 = tx; ty0 = ty;
      img.style.transition = 'none';
    }
  }

  function laMiscare(e) {
    if (!degete.has(e.pointerId)) return;
    if (e.cancelable) e.preventDefault();
    degete.set(e.pointerId, { x: e.clientX, y: e.clientY });

    /* — pinch cu doua degete — */
    if (degete.size >= 2) {
      const [a, b] = [...degete.values()];
      const acum = Math.hypot(b.x - a.x, b.y - a.y);
      if (pinch0 > 0) {
        scara = prinde(scara0 * (acum / pinch0));
        if (scara <= 1.01) { tx = 0; ty = 0; }
        limiteaza();
        aplica();
      }
      miscat = true;
      return;
    }

    if (!apucat || degete.size !== 1) return;

    const dx = e.clientX - ax;
    const dy = e.clientY - ay;
    if (Math.abs(dx) > 6 || Math.abs(dy) > 6) miscat = true;

    /* — marita: degetul plimba poza — */
    if (scara > 1.01) {
      tx = tx0 + dx;
      ty = ty0 + dy;
      limiteaza();
      aplica();
      return;
    }

    /* — nemarita: swipe — */
    if (Math.abs(dy) > Math.abs(dx)) {          // in jos → inchidere
      img.style.transform = `translateY(${dy}px) scale(${Math.max(0.85, 1 - Math.abs(dy) / 900)})`;
      box.style.setProperty('--vz-opac', String(Math.max(0.25, 1 - Math.abs(dy) / 450)));
    } else {                                     // lateral → alta poza
      const frana = poze.length < 2 ? 0.25 : 1;
      img.style.transform = `translateX(${dx * frana}px)`;
    }
  }

  function ridicat(e) {
    if (!degete.has(e.pointerId)) return;
    degete.delete(e.pointerId);

    if (degete.size === 1) {          // s-a terminat pinch-ul, ramane un deget
      const [r] = [...degete.values()];
      apucat = true; ax = r.x; ay = r.y; tx0 = tx; ty0 = ty;
      return;
    }
    if (degete.size > 0) return;

    box.style.removeProperty('--vz-opac');
    apucat = false;

    if (scara > 1.01) { limiteaza(); aplica(true); return; }

    const dx = e.clientX - ax;
    const dy = e.clientY - ay;

    if (!miscat) {                    // a fost un tap, nu o tragere
      const acum = Date.now();
      if (acum - ultimulTap < 300) {  // dublu-tap → zoom acolo unde ai apasat
        ultimulTap = 0;
        scara = ZOOM_TAP;
        const r = scena.getBoundingClientRect();
        tx = (r.width / 2 - (e.clientX - r.left)) * (ZOOM_TAP - 1);
        ty = (r.height / 2 - (e.clientY - r.top)) * (ZOOM_TAP - 1);
        limiteaza();
        aplica(true);
      } else {
        ultimulTap = acum;
        setTimeout(() => {            // tap simplu → ascunde/arata butoanele
          if (Date.now() - ultimulTap >= 300 && scara <= 1.01) {
            box.classList.toggle('vz-curat');
            inchideMeniu();
          }
        }, 310);
      }
      return;
    }

    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 110) { inchide(); return; }
    if (Math.abs(dx) > 55) muta(dx < 0 ? 1 : -1);
    else { img.style.transition = 'transform .26s cubic-bezier(.22,.9,.3,1)'; aplica(true); }
  }

  // Apasarea o prindem pe scena, dar miscarea si ridicarea pe window:
  // altfel, daca degetul iese de pe poza, pierdem gestul la jumatate.
  scena.addEventListener('pointerdown', laApasare);
  window.addEventListener('pointermove', laMiscare, { passive: false });
  window.addEventListener('pointerup', ridicat);
  window.addEventListener('pointercancel', ridicat);

  /* Safari pe iPhone trateaza pinch-ul ca gest de browser si nu ne
     trimite mereu al doilea deget prin pointer events. Pentru iOS
     ascultam si evenimentele lui proprii de gest. */
  let scaraGest = 1;
  scena.addEventListener('gesturestart', (e) => { e.preventDefault(); scaraGest = scara; });
  scena.addEventListener('gesturechange', (e) => {
    e.preventDefault();
    scara = prinde(scaraGest * e.scale);
    if (scara <= 1.01) { tx = 0; ty = 0; }
    limiteaza();
    aplica();
  });
  scena.addEventListener('gestureend', (e) => { e.preventDefault(); limiteaza(); aplica(true); });

  /* zoom cu rotita, pe desktop */
  scena.addEventListener('wheel', (e) => {
    e.preventDefault();
    scara = prinde(scara * (e.deltaY < 0 ? 1.12 : 0.89));
    if (scara <= 1.01) { tx = 0; ty = 0; }
    limiteaza();
    aplica();
  }, { passive: false });

  /* click pe fundal / in afara meniului */
  box.querySelector('.vz-fundal').onclick = inchide;
  box.addEventListener('click', (e) => {
    if (!meniu.hidden && !meniu.contains(e.target) && e.target !== btnMeniu) inchideMeniu();
  });

  arata();
  return { inchide };
}

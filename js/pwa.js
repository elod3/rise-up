/**
 * PWA — instalarea GALERIEI ca aplicatie. Se incarca doar pe pagina galeriei.
 *
 *   • Chromium (Chrome/Edge/Brave, Android/desktop): un chip discret jos-dreapta
 *     care deschide dialogul nativ la un tap. Numele „Rise Up" e deja completat
 *     din manifest, deci nu mai redenumesti.
 *   • iPhone (Safari): un indiciu discret Share → „Adaugă la ecran" (Apple nu
 *     permite buton automat).
 *   • In browsere din alte app-uri (Instagram/Facebook/TikTok) sau daca e deja
 *     instalata: nu aratam nimic.
 *
 * Service worker-ul are scope "/", deci desi il inregistram din galerie, face
 * tot site-ul mai rapid si disponibil offline.
 */

// 1. Service worker (offline + instalabilitate).
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

const ua      = navigator.userAgent || '';
const inApp   = /FBAN|FBAV|Instagram|Line\/|Twitter|Snapchat|Pinterest|MicroMessenger|TikTok|WhatsApp/i.test(ua);
const iOS     = /iphone|ipad|ipod/i.test(ua);
const instalat = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

const respins        = () => { try { return sessionStorage.getItem('pwa-x') === '1'; } catch { return false; } };
const marcheazaRespins = () => { try { sessionStorage.setItem('pwa-x', '1'); } catch {} };

const icoDesc  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>';
const icoShare = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M8.5 7.5 12 4l3.5 3.5"/><path d="M6 12v6a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-6"/></svg>';

function injecteazaStil() {
  if (document.getElementById('pwa-stil')) return;
  const s = document.createElement('style');
  s.id = 'pwa-stil';
  s.textContent = `
  .pwa-chip{position:fixed;right:14px;bottom:calc(14px + env(safe-area-inset-bottom,0px));z-index:1500;
    display:none;align-items:center;gap:7px;padding:8px 10px 8px 13px;border-radius:999px;
    border:1px solid rgba(255,255,255,.16);background:rgba(20,24,33,.94);
    -webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;
    font:600 13px/1 inherit;cursor:pointer;box-shadow:0 8px 24px rgba(0,0,0,.4);
    opacity:0;transform:translateY(14px);transition:opacity .25s ease,transform .25s ease}
  .pwa-chip.arata{display:inline-flex;opacity:1;transform:translateY(0)}
  .pwa-chip svg{width:16px;height:16px;flex:none}
  .pwa-chip .pwa-x{opacity:.5;font-size:16px;line-height:1;padding:0 3px;margin-left:1px}
  .pwa-chip .pwa-x:hover{opacity:1}
  .pwa-hint{position:fixed;right:14px;bottom:calc(58px + env(safe-area-inset-bottom,0px));z-index:1500;
    max-width:min(80vw,270px);padding:12px 14px;border-radius:14px;display:none;
    border:1px solid rgba(255,255,255,.14);background:rgba(20,24,33,.98);color:#fff;
    font:400 12.5px/1.55 inherit;box-shadow:0 12px 34px rgba(0,0,0,.5)}
  .pwa-hint.arata{display:block}
  .pwa-hint b{font-weight:700}
  .pwa-hint svg{width:15px;height:15px;vertical-align:-2px}`;
  document.head.appendChild(s);
}

function chip(interior) {
  injecteazaStil();
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'pwa-chip';
  b.innerHTML = interior;
  document.body.appendChild(b);
  requestAnimationFrame(() => b.classList.add('arata'));
  return b;
}

/* ─── Chromium: buton nativ de instalare ─── */
let promptInstalare = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();                 // oprim bannerul automat...
  promptInstalare = e;                // ...si il declansam noi la tap
  if (instalat || inApp || respins()) return;

  const b = chip(`${icoDesc}<span>Instalează</span><span class="pwa-x" role="button" aria-label="Nu acum">×</span>`);
  b.addEventListener('click', async (ev) => {
    if (ev.target.classList.contains('pwa-x')) { b.classList.remove('arata'); marcheazaRespins(); return; }
    if (!promptInstalare) return;
    promptInstalare.prompt();
    await promptInstalare.userChoice.catch(() => {});
    promptInstalare = null;
    b.classList.remove('arata');
  });
});

addEventListener('appinstalled', () => {
  promptInstalare = null;
  document.querySelectorAll('.pwa-chip, .pwa-hint').forEach((n) => n.classList.remove('arata'));
});

/* ─── iPhone (Safari): indiciu discret, Apple nu permite buton automat ─── */
if (iOS && !instalat && !inApp && navigator.standalone === false && !respins()) {
  addEventListener('load', () => {
    let hint = null;
    const b = chip(`${icoShare}<span>Adaugă pe ecran</span><span class="pwa-x" role="button" aria-label="Nu acum">×</span>`);
    b.addEventListener('click', (ev) => {
      if (ev.target.classList.contains('pwa-x')) {
        b.classList.remove('arata');
        if (hint) hint.classList.remove('arata');
        marcheazaRespins();
        return;
      }
      if (!hint) {
        hint = document.createElement('div');
        hint.className = 'pwa-hint';
        hint.innerHTML = `Apasă ${icoShare} <b>Share</b> în bara de jos, apoi alege <b>„Adaugă la ecranul principal"</b>.`;
        document.body.appendChild(hint);
      }
      hint.classList.toggle('arata');
    });
  });
}

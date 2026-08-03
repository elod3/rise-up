/**
 * PWA: instalarea site-ului ca aplicatie + functionare offline.
 *
 * Butonul de instalare apare DOAR cand browserul confirma ca site-ul e
 * instalabil (si nu e deja instalat). Un singur tap deschide dialogul nativ,
 * cu numele "Rise Up" deja completat (din manifest) — deci nu mai redenumesti.
 *
 * Nota: confirmarea finala a instalarii o cere browserul si nu poate fi
 * sarita de nicio pagina web (regula de securitate). Noi o facem cat mai
 * scurta: un tap → instalat.
 */

// 1. Inregistram service worker-ul (offline + instalabilitate).
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

// 2. Butonul de instalare (un singur tap).
let promptInstalare = null;

const respins = () => {
  try { return sessionStorage.getItem('pwa-x') === '1'; } catch { return false; }
};

function creeazaButon() {
  let b = document.getElementById('pwa-install');
  if (b) return b;

  const stil = document.createElement('style');
  stil.textContent = `
  #pwa-install{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom, 0px));
    z-index:1500;display:none;align-items:center;gap:9px;padding:11px 16px 11px 18px;
    border-radius:999px;border:1px solid rgba(255,255,255,.18);
    background:rgba(20,24,33,.96);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
    color:#fff;font:600 14px/1 inherit;cursor:pointer;box-shadow:0 12px 34px rgba(0,0,0,.45);
    opacity:0;transform:translateX(-50%) translateY(18px);
    transition:opacity .25s ease, transform .25s ease}
  #pwa-install.arata{display:flex;opacity:1;transform:translateX(-50%) translateY(0)}
  #pwa-install svg{width:18px;height:18px;flex:none}
  #pwa-install .pwa-x{margin-left:2px;opacity:.55;font-size:18px;line-height:1;padding:0 4px}
  #pwa-install .pwa-x:hover{opacity:1}`;
  document.head.appendChild(stil);

  b = document.createElement('button');
  b.id = 'pwa-install';
  b.type = 'button';
  b.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7.5 10.5 12 15l4.5-4.5"/><path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/></svg>
    <span>Instalează aplicația</span>
    <span class="pwa-x" role="button" aria-label="Nu acum">×</span>`;
  document.body.appendChild(b);

  b.addEventListener('click', async (e) => {
    if (e.target.classList.contains('pwa-x')) {
      ascunde();
      try { sessionStorage.setItem('pwa-x', '1'); } catch {}
      return;
    }
    if (!promptInstalare) return;
    promptInstalare.prompt();
    await promptInstalare.userChoice.catch(() => {});
    promptInstalare = null;
    ascunde();
  });
  return b;
}

function arataButon() {
  if (respins()) return;
  if (matchMedia('(display-mode: standalone)').matches) return;   // deja instalata
  const b = creeazaButon();
  requestAnimationFrame(() => b.classList.add('arata'));
}

function ascunde() {
  const b = document.getElementById('pwa-install');
  if (b) b.classList.remove('arata');
}

addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();          // oprim bannerul automat al browserului...
  promptInstalare = e;         // ...si il declansam noi, curat, la tap pe buton
  arataButon();
});

addEventListener('appinstalled', () => { promptInstalare = null; ascunde(); });

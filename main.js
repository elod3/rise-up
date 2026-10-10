/* ═══════════════════════════════════════════════════════════════
   RISE UP — JS partajat (toate paginile)
   ═══════════════════════════════════════════════════════════════ */
(function(){
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ─────────── TEMA (dark / light) ─────────── */
  const root = document.documentElement;
  const saved = localStorage.getItem('riseup-theme');
  if (saved) root.setAttribute('data-theme', saved);
  const themeBtn = document.getElementById('theme-btn');
  if (themeBtn){
    themeBtn.addEventListener('click', () => {
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      localStorage.setItem('riseup-theme', next);
    });
  }

  /* ─────────── NAVBAR — transparent → solid la scroll ─────────── */
  const nav = document.getElementById('nav');
  function onScroll(){
    if (nav) nav.classList.toggle('scrolled', window.scrollY > 40);
  }
  window.addEventListener('scroll', onScroll, { passive:true });
  onScroll();

  /* ─────────── MENIU MOBIL ─────────── */
  const burger = document.getElementById('burger');
  const menu = document.getElementById('mobile-menu');
  if (burger && menu){
    const toggle = (open) => {
      menu.classList.toggle('open', open);
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open);
      document.body.style.overflow = open ? 'hidden' : '';
    };
    burger.addEventListener('click', () => toggle(!menu.classList.contains('open')));
    menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => toggle(false)));
  }

  /* ─────────── POARTA DE ÎNSCRIERE (citește + bifează + înscrie) ─────────── */
  const agree = document.getElementById('agree-check');
  const enrollBtn = document.getElementById('enroll-btn');
  const enrollNote = document.getElementById('enroll-note');
  const enrollClosed = enrollBtn && enrollBtn.dataset.closed === 'true';
  if (enrollClosed){
    /* Înscrieri închise: butonul rămâne blocat, oricât ai bifa. */
    enrollBtn.setAttribute('aria-disabled', 'true');
    enrollBtn.addEventListener('click', (e) => {
      e.preventDefault();
      enrollNote.textContent = 'Înscrierile s-au încheiat. Ne vedem la ediția următoare! ✨';
      enrollNote.style.color = 'var(--fire)';
    });
  } else if (agree && enrollBtn && enrollNote){
    agree.addEventListener('change', () => {
      const ok = agree.checked;
      enrollBtn.setAttribute('aria-disabled', String(!ok));
      enrollNote.style.color = '';
      enrollNote.textContent = ok
        ? 'Gata! Acum poți apăsa „Înscrie-te la tabără".'
        : 'Bifează că ești de acord cu regulamentul ca să poți continua.';
    });
    enrollBtn.addEventListener('click', (e) => {
      if (enrollBtn.getAttribute('aria-disabled') === 'true'){
        e.preventDefault();
        const box = agree.closest('.agree');
        box.classList.remove('shake'); void box.offsetWidth; box.classList.add('shake');
        enrollNote.textContent = 'Trebuie să citești regulamentul și să bifezi acordul mai întâi.';
        enrollNote.style.color = 'var(--fire)';
        return;
      }
      const url = enrollBtn.dataset.href;
      e.preventDefault();
      if (!url){
        enrollNote.textContent = 'Linkul de înscriere va fi disponibil în curând. Mulțumim! ✨';
        enrollNote.style.color = 'var(--fire)';
      } else {
        window.open(url, '_blank', 'noopener');
      }
    });
  }

  /* ─────────── REVEAL LA SCROLL ─────────── */
  const reveals = document.querySelectorAll('.reveal');
  if (reveals.length){
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold:.15, rootMargin:'0px 0px -8% 0px' });
    reveals.forEach(r => io.observe(r));
  }

  /* ─────────── HERO LA SCROLL ───────────
     Afişul creşte din ramă până umple ecranul, stă aşa o clipă, apoi se
     stinge odată cu fundalul neclar — rămâne cerul cu stele, şi abia apoi
     vine restul conţinutului. Toată mişcarea ţine cât e #hero mai înalt
     decât ecranul (vezi height:200svh în CSS). */
  const hero   = document.getElementById('hero');
  const stage  = document.querySelector('.hero-stage');
  const slot   = document.querySelector('.hero-slot');
  const frame  = document.querySelector('.hero-frame');
  const heroMedia = document.querySelector('.hero-media');
  const heroVeil  = document.querySelector('.hero-veil');
  const heroFade  = [...document.querySelectorAll('.hero-sub,.hero-verse,.hero-ctas,.scroll-hint')];

  /* Daca scena nu e "sticky" (ecran scund sau prefers-reduced-motion),
     hero-ul e o sectiune obisnuita si nu avem ce anima. */
  const stickyStage = stage && getComputedStyle(stage).position === 'sticky';
  if (hero && stage && slot && frame && stickyStage && !reduceMotion){
    const clamp = (v) => v < 0 ? 0 : v > 1 ? 1 : v;
    const lerp  = (a, b, k) => a + (b - a) * k;
    const ease  = (k) => 1 - Math.pow(1 - k, 3);   /* porneste repede, aterizeaza lin */

    let queued = false, ready = false;

    const paint = () => {
      queued = false;
      const span = Math.max(1, hero.offsetHeight - stage.offsetHeight);
      const p = clamp((window.scrollY - hero.offsetTop) / span);

      /* 1. cresterea: de la rama la tot ecranul, in prima jumatate */
      const g = ease(clamp(p / 0.55));
      if (ready){
        const r = slot.getBoundingClientRect();
        const s = stage.getBoundingClientRect();
        /* Pe ecran lat umplem tot ecranul. Pe telefon ne oprim la toata latimea,
           pastrand 16:9 — altfel "cover" ar taia jumatate din afis, iar "contain"
           ar lasa doua benzi negre uriase. */
        const wide = s.width / s.height >= 1.15;
        const tw = s.width;
        const th = wide ? s.height : s.width * 9 / 16;
        const tl = s.left;
        const tt = s.top + (s.height - th) / 2;
        frame.style.left   = lerp(r.left,   tl, g).toFixed(1) + 'px';
        frame.style.top    = lerp(r.top,    tt, g).toFixed(1) + 'px';
        frame.style.width  = lerp(r.width,  tw, g).toFixed(1) + 'px';
        frame.style.height = lerp(r.height, th, g).toFixed(1) + 'px';
        frame.style.borderRadius = (18 * (1 - g)).toFixed(1) + 'px';
      }

      /* 2. textul pleaca primul, ca sa nu fie acoperit de afisul care creste */
      const textOp = clamp((0.26 - p) / 0.22);
      heroFade.forEach(el => { el.style.opacity = textOp.toFixed(3); });

      /* 3. afisul se stinge dupa ce a stat o clipa pe tot ecranul */
      frame.style.opacity = clamp((0.94 - p) / 0.22).toFixed(3);

      /* 4. la urma se duce si fundalul neclar — ramane doar cerul cu stele */
      const bgOp = clamp((1 - p) / 0.2).toFixed(3);
      if (heroMedia){
        heroMedia.style.opacity = bgOp;
        /* Fundalul se apropie si el putin, ca sa nu para inghetat. Scalam
           invelisul, nu poza: poza are deja scale(1.32) din CSS, marja de care
           are nevoie blur-ul ca sa nu lase o dunga deschisa pe margini. */
        heroMedia.style.transform = 'scale(' + (1 + g * 0.18).toFixed(3) + ')';
      }
      if (heroVeil)  heroVeil.style.opacity  = bgOp;
    };

    const arm = () => {
      if (ready) return;
      ready = true;
      hero.classList.add('scroll-ready');   /* de aici inainte comanda scroll-ul */
      /* Rama iese din flux ca sa poata creste peste tot ecranul; "hero-slot"
         ramane pe loc si tine spatiul, ca sa nu sara textul de dedesubt. */
      const r = slot.getBoundingClientRect();
      frame.style.position    = 'fixed';
      frame.style.borderColor = 'transparent';
      frame.style.left   = r.left   + 'px';
      frame.style.top    = r.top    + 'px';
      frame.style.width  = r.width  + 'px';
      frame.style.height = r.height + 'px';
      paint();
    };

    const onHeroScroll = () => {
      arm();
      if (!queued){ queued = true; requestAnimationFrame(paint); }
    };
    window.addEventListener('scroll', onHeroScroll, { passive:true });
    window.addEventListener('resize', onHeroScroll, { passive:true });
    /* daca nimeni nu da scroll, armam dupa ce se termina animatia de intrare */
    setTimeout(arm, 1900);
  }

  /* ─────────── CER CU STELE (fundal fix, toată pagina) ─────────── */
  const cv = document.getElementById('stars');
  if (cv){
    const ctx = cv.getContext('2d');
    let dpr = 1, W = 0, H = 0, ps = [];

    const make = () => ({
      x:  Math.random() * W,
      y:  Math.random() * H,
      r:  Math.random() * 1.4 + 0.35,
      a:  Math.random() * 0.4 + 0.22,   /* luminozitatea de baza */
      tw: Math.random() * 0.9 + 0.2,    /* cat de repede licareste */
      ph: Math.random() * 6.283,
      dx: (Math.random() - 0.5) * 0.05, /* plutesc foarte incet */
      dy: (Math.random() - 0.5) * 0.05,
    });

    const size = () => {
      const oldW = W, oldH = H;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = window.innerWidth; H = window.innerHeight;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!ps.length){
        ps = Array.from({ length: W < 860 ? 70 : 150 }, make);
      } else {
        /* Pe telefon bara de adresa se ascunde la scroll si asta da 'resize'.
           Daca am regenera stelele aici, ar sari dintr-un loc in altul —
           asa ca doar le reasezam proportional. */
        const sx = oldW ? W / oldW : 1, sy = oldH ? H / oldH : 1;
        for (const s of ps){ s.x *= sx; s.y *= sy; }
      }
    };
    size();
    let rsz; window.addEventListener('resize', () => {
      clearTimeout(rsz);
      rsz = setTimeout(() => { size(); if (reduceMotion) tick(0); }, 150);
    });

    function tick(now){
      if (!reduceMotion) requestAnimationFrame(tick);   /* fara animatie: un singur cadru */
      if (document.hidden) return;
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      const rgb = light ? '47,98,173' : '226,236,255';
      const mul = light ? 0.55 : 1;
      const t = (now || 0) * 0.001;

      ctx.clearRect(0, 0, W, H);
      ctx.shadowColor = 'rgba(' + rgb + ',.55)';
      for (const s of ps){
        if (!reduceMotion){ s.x += s.dx; s.y += s.dy; }
        if (s.x < -4) s.x = W + 4; else if (s.x > W + 4) s.x = -4;
        if (s.y < -4) s.y = H + 4; else if (s.y > H + 4) s.y = -4;
        const a = Math.max(0, (s.a + (reduceMotion ? 0 : Math.sin(t * s.tw + s.ph) * 0.2)) * mul);
        ctx.shadowBlur = s.r > 1.05 ? 6 : 0;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.283);
        ctx.fillStyle = 'rgba(' + rgb + ',' + a.toFixed(3) + ')';
        ctx.fill();
      }
      ctx.shadowBlur = 0;
    }
    tick(0);
  }
})();

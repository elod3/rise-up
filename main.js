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
  if (agree && enrollBtn && enrollNote){
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
        enrollNote.textContent = 'Linkul de înscriere va fi disponibil în curând. Mulțumim! 🔥';
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

  /* ─────────── PARALLAX UȘOR PE HERO ─────────── */
  const heroMedia = document.querySelector('.hero-media');
  if (heroMedia && !reduceMotion){
    window.addEventListener('scroll', () => {
      const y = window.scrollY;
      if (y < window.innerHeight * 1.3) heroMedia.style.transform = `translateY(${y * 0.18}px) scale(1.05)`;
    }, { passive:true });
  }

  /* ─────────── PARTICULE DE FOC PE HERO ─────────── */
  const cv = document.getElementById('embers');
  if (cv && !reduceMotion){
    const host = cv.parentElement;
    const ctx = cv.getContext('2d');
    let on = true;
    const size = () => { cv.width = host.clientWidth; cv.height = host.clientHeight; };
    size(); window.addEventListener('resize', size);
    const N = innerWidth < 860 ? 26 : 52;
    const make = (bottom) => ({
      x: Math.random()*cv.width,
      y: bottom ? cv.height + 10 : Math.random()*cv.height,
      r: Math.random()*1.9 + .5,
      s: Math.random()*.6 + .2,
      d: Math.random()*.5 - .25,
      a: Math.random()*.5 + .15,
    });
    const ps = Array.from({length:N}, () => make(false));
    (function tick(){
      if (on){
        ctx.clearRect(0,0,cv.width,cv.height);
        for (const p of ps){
          p.y -= p.s; p.x += p.d + Math.sin(p.y*.012)*.18; p.a -= .0009;
          if (p.y < -12 || p.a <= 0) Object.assign(p, make(true));
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283);
          ctx.fillStyle = `rgba(242,166,74,${p.a})`;
          ctx.shadowColor = 'rgba(242,166,74,.7)'; ctx.shadowBlur = 6; ctx.fill();
        }
      }
      requestAnimationFrame(tick);
    })();
    new IntersectionObserver(es => es.forEach(e => on = e.isIntersecting), {threshold:0}).observe(host);
  }
})();

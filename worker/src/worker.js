/**
 * Rise Up — Worker galerie foto
 *
 * Doua treburi:
 *   POST /upload  → primeste o poza de la fotograf si o pune in R2
 *   GET  /f/<key> → serveste poza catre oricine (galeria e publica)
 *
 * Securitate: inainte de orice upload, intrebam Supabase daca token-ul
 * trimis e valid si daca userul are rolul 'photographer'. Nu tinem
 * niciun secret aici — verificarea o face Supabase, noi doar intrebam.
 */

/** IP-ul real al vizitatorului, pus de Cloudflare. */
const ipul = (r) => r.headers.get('CF-Connecting-IP') || 'necunoscut';

/**
 * Un token Supabase are trei bucati separate prin punct. Verificam
 * forma INAINTE sa intrebam Supabase — asa, cineva care trimite gunoi
 * primeste 401 direct de la noi, fara sa apuce sa bata la usa bazei.
 */
const paresTokenValid = (t) => /^[\w-]+\.[\w-]+\.[\w-]+$/.test(t);

/**
 * Tinem minte 60 de secunde ca un token e al fotografului, ca sa nu
 * intrebam Supabase la fiecare poza dintr-un lot de 300.
 */
const tinereMinte = new Map();
const CACHE_MS = 60_000;

const TIPURI_OK = [
  'image/jpeg', 'image/png', 'image/webp',
  'image/heic', 'image/heif', 'image/gif', 'image/avif',
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = anteturiCors(request, env);

    // Browserul intreaba "am voie?" inainte de POST-ul propriu-zis.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    const ip = ipul(request);

    if (request.method === 'POST' && url.pathname === '/upload') {
      if (!(await subLimita(env.LIMITA_UPLOAD, ip))) return preaMulte(cors);
      return incarca(request, env, cors, ip);
    }

    if (request.method === 'GET' && url.pathname.startsWith('/f/')) {
      if (!(await subLimita(env.LIMITA_CITIRE, ip))) return preaMulte(cors);
      return serveste(url.pathname.slice(3), env, url.searchParams);
    }

    if (request.method === 'DELETE' && url.pathname.startsWith('/f/')) {
      if (!(await subLimita(env.LIMITA_UPLOAD, ip))) return preaMulte(cors);
      return sterge(request, url.pathname.slice(3), env, cors, ip);
    }

    if (url.pathname === '/health') {
      return new Response('ok', { headers: cors });
    }

    return json({ error: 'Ruta necunoscuta' }, 404, cors);
  },
};

/* ─────────── UPLOAD ─────────── */

async function incarca(request, env, cors, ip) {
  // 1. Are token?
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Trebuie sa fii logat.' }, 401, cors);

  // 2. E fotograf? (intrebam Supabase, nu ne bazam pe ce zice clientul)
  const user = await verificaFotograf(token, env, ip);
  if (!user.ok) return json({ error: user.motiv }, user.status, cors);

  // 3. Fisierul e acceptabil?
  const tip = request.headers.get('Content-Type') || '';
  if (!TIPURI_OK.includes(tip.toLowerCase().split(';')[0].trim())) {
    return json({ error: `Tip de fisier neacceptat: ${tip}` }, 415, cors);
  }

  const marime = Number(request.headers.get('Content-Length') || 0);
  const maxim = Number(env.MAX_BYTES || 52428800);
  if (marime > maxim) {
    return json({ error: `Fisier prea mare (max ${Math.round(maxim / 1048576)} MB).` }, 413, cors);
  }

  // 4. Construim calea in R2. ID-ul vine de la client ca originalul si
  //    thumbnail-ul aceleiasi poze sa aiba acelasi nume.
  const p = new URL(request.url).searchParams;
  const fel = p.get('kind') === 'thumb' ? 'thumbs' : 'originals';
  const id = (p.get('id') || crypto.randomUUID()).replace(/[^a-zA-Z0-9-]/g, '');
  const ext = (p.get('ext') || 'jpg').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5).toLowerCase();
  const zi = new Date().toISOString().slice(0, 10);
  const cheie = `${fel}/${zi}/${id}.${ext}`;

  // 5. In R2.
  await env.BUCKET.put(cheie, request.body, {
    httpMetadata: { contentType: tip, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { uploadedBy: user.id },
  });

  return json({ key: cheie, url: `${new URL(request.url).origin}/f/${cheie}` }, 200, cors);
}

/**
 * Doua intrebari catre Supabase:
 *   1. /auth/v1/user  → token-ul e valid? cine e?
 *   2. /rest/v1/profiles → ce rol are?
 *
 * A doua o facem cu token-ul userului, nu cu o cheie de admin — RLS
 * ii da voie sa-si citeasca doar propriul rand. Deci nici aici nu avem
 * nevoie de vreun secret.
 */
async function verificaFotograf(token, env, ip) {
  // Gunoi evident → il oprim aici, nu deranjam Supabase.
  if (!paresTokenValid(token)) {
    return { ok: false, status: 401, motiv: 'Sesiune invalida.' };
  }

  const stiut = tinereMinte.get(token);
  if (stiut && stiut.pana > Date.now()) return { ok: true, id: stiut.id };

  // Un token nevalid costa o cerere catre Supabase, deci limitam
  // separat cate esecuri acceptam de la un IP.
  if (!(await subLimita(env.LIMITA_AUTH, ip))) {
    return { ok: false, status: 429, motiv: 'Prea multe incercari. Asteapta un minut.' };
  }

  const h = { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` };

  const r = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers: h });
  if (!r.ok) return { ok: false, status: 401, motiv: 'Sesiune invalida sau expirata.' };
  const u = await r.json();

  const rp = await fetch(`${env.SUPABASE_URL}/rest/v1/profiles?select=role&limit=1`, { headers: h });
  const randuri = rp.ok ? await rp.json() : [];
  if (randuri[0]?.role !== 'photographer') {
    return { ok: false, status: 403, motiv: 'Contul tau nu are drept de incarcare.' };
  }

  tinereMinte.set(token, { id: u.id, pana: Date.now() + CACHE_MS });
  if (tinereMinte.size > 50) tinereMinte.clear();   // nu lasam sa creasca la nesfarsit

  return { ok: true, id: u.id };
}

/** Cloudflare ne spune daca IP-ul asta a depasit limita. */
async function subLimita(limitator, ip) {
  if (!limitator) return true;              // in dev local nu exista binding-ul
  try {
    const { success } = await limitator.limit({ key: ip });
    return success;
  } catch {
    return true;                            // daca limitatorul cade, nu blocam site-ul
  }
}

function preaMulte(cors) {
  return new Response(
    JSON.stringify({ error: 'Prea multe cereri. Incearca peste un minut.' }),
    { status: 429, headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '60' } },
  );
}

/* ─────────── SERVIT ─────────── */

async function serveste(cheie, env, parametri) {
  const obiect = await env.BUCKET.get(cheie);
  if (!obiect) return new Response('Poza nu exista', { status: 404 });

  const h = new Headers();
  obiect.writeHttpMetadata(h);
  h.set('etag', obiect.httpEtag);
  h.set('Cache-Control', 'public, max-age=31536000, immutable');
  h.set('Access-Control-Allow-Origin', '*'); // pozele sunt publice

  // Cu ?dl=1 fortam descarcarea in loc de deschidere in tab.
  // Atributul "download" din HTML nu functioneaza intre domenii diferite,
  // deci descarcarea trebuie ceruta de server, nu de pagina.
  if (parametri?.get('dl')) {
    const nume = (parametri.get('nume') || cheie.split('/').pop()).replace(/[^\w.\-]/g, '_');
    h.set('Content-Disposition', `attachment; filename="${nume}"`);
    h.delete('Cache-Control');
  }

  return new Response(obiect.body, { headers: h });
}

/** Sterge o poza din R2. Doar fotograful are voie. */
async function sterge(request, cheie, env, cors, ip) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Trebuie sa fii logat.' }, 401, cors);

  const user = await verificaFotograf(token, env, ip);
  if (!user.ok) return json({ error: user.motiv }, user.status, cors);

  await env.BUCKET.delete(cheie);
  return json({ sters: cheie }, 200, cors);
}

/* ─────────── AJUTOARE ─────────── */

function anteturiCors(request, env) {
  const permise = (env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  const origine = request.headers.get('Origin') || '';
  return {
    'Access-Control-Allow-Origin': permise.includes(origine) ? origine : permise[0] || '',
    'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(corp, status, cors) {
  return new Response(JSON.stringify(corp), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

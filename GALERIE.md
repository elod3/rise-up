# Galeria foto — cum funcționează

Site-ul a rămas exact ce era: pagini HTML statice pe GitHub Pages.
Galeria e adăugată peste, fără niciun framework.

## Cine face ce

| Serviciu | Rol | Cost |
|---|---|---|
| GitHub Pages | site-ul | gratis |
| Supabase | login fotograf + evidența pozelor | gratis |
| Cloudflare R2 (bucket `tabara`) | fișierele foto | gratis până la 10 GB |
| Cloudflare Worker (`rise-up-galerie`) | primește pozele și le servește | gratis (100k cereri/zi) |

**Nu există niciun secret în cod.** Cheia `anon` de Supabase e publică
prin design; securitatea o fac regulile RLS din baza de date. Worker-ul
nu ține nici el vreo cheie — întreabă Supabase dacă token-ul e valid.

## Cum urcă fotograful pozele

1. Intră pe site și dă **4 click-uri rapide pe logo** (stânga sus)
2. Apare formularul de login → email + parolă
3. Ajunge pe `upload.html`: trage pozele în pagină sau dă click
4. Pozele apar în galerie instant, la toată lumea (realtime)

Nu există link către `upload.html` nicăieri pe site, iar pagina are
`noindex` — nu apare în Google.

## Ce se întâmplă la o încărcare

```
poza (din calculator)
  ├─ thumbnail 600px făcut în browser ──┐
  └─ originalul, nemodificat ───────────┤
                                        ▼
                              Worker (verifică rolul)
                                        ▼
                                  R2 bucket 'tabara'
                                        ▼
                    rândul se salvează în tabelul 'photos'
```

În baza de date se salvează doar **calea** (`originals/2026-07-20/x.jpg`),
nu adresa completă. Adresa se construiește la afișare din `js/config.js`,
ca pozele să nu se strice dacă Worker-ul se mută pe alt domeniu.

## Fișiere

```
js/config.js        adresele Supabase + Worker (publice)
js/login-ascuns.js  cele 4 tap-uri + formularul de login
js/galerie.js       grila, lightbox-ul, realtime
js/upload.js        drag & drop, thumbnail, cozi de încărcare
upload.html         pagina fotografului
worker/             Worker-ul Cloudflare
sql/001_galerie.sql schema + regulile de securitate
```

## Treburi de administrare

**Cont nou de fotograf**
Supabase → Authentication → Add User (bifează *Auto Confirm*), apoi
Table Editor → `profiles` → la userul lui pune `role = 'photographer'`.
Fără pasul doi, contul se loghează dar nu poate urca nimic.

**Ștergerea unei poze**
Ștergi rândul din `photos` (Table Editor). Fișierul rămâne în R2 — dacă
vrei curat de tot, îl ștergi și din bucket-ul `tabara`.

**Modificări în Worker**
```bash
cd worker
npx wrangler deploy
```

**Rularea locală**
```bash
python3 -m http.server 8000      # site-ul → localhost:8000
cd worker && npx wrangler dev    # Worker + R2 local → localhost:8787
```
`wrangler dev` folosește un R2 simulat pe disc — nu atinge bucket-ul real.

## De reținut

- **HEIC** (poze de iPhone): browserul nu le poate citi ca să facă
  thumbnail, așa că grila afișează originalul. Merge, dar se încarcă mai
  greu. Dacă fotografull are iPhone, ideal ar seta aparatul pe JPEG.
- **Limita e 50 MB per fișier** (`MAX_BYTES` în `worker/wrangler.toml`).
- **`npm install` în `worker/`** are nevoie de `.npmrc` cu
  `ignore-scripts=true` — altfel `sharp` încearcă să compileze pe Node 26
  și pică. Fișierul e deja acolo.

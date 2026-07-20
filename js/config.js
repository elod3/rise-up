/**
 * Setari galerie foto.
 *
 * Cheile de aici sunt PUBLICE — asa sunt gandite. Cheia "anon" nu da
 * singura niciun drept; regulile RLS de pe serverul Supabase decid
 * cine ce poate face. Nu pune niciodata aici o cheie "service_role".
 */

export const SUPABASE_URL = 'https://svrvfeuhhjldrunqotie.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_EpJDq0ODwiw3bE4Ce38RrQ_2GXcG4Rg';

// Pe laptop vorbim cu Worker-ul local; pe site, cu cel de pe Cloudflare.
const local = ['localhost', '127.0.0.1'].includes(location.hostname);

export const WORKER_URL = local
  ? 'http://localhost:8787'
  : 'https://rise-up-galerie.PLACEHOLDER.workers.dev';  // ← completat la deploy

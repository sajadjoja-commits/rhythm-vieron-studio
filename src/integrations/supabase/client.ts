import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';
import { safeStorage } from '@/lib/safeStorage';

// Lock the browser client to the active Vireon Supabase project.
// These are public client credentials; do not use service-role keys in the frontend.
export const SUPABASE_URL = 'https://zehsxvunlwezknxdmmyn.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_lvElEzgvqlL5cXdwkUQAoA_BnxtdNdD';

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: safeStorage,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});

import { createClient } from '@supabase/supabase-js'

// The backend is optional. Without these two env vars the app runs exactly as
// before -- no auth, no tracking -- so a contributor can work on the geometry
// features without a Supabase project. See docs/architecture/backend.md.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = isSupabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'geoscratch:auth',
      },
    })
  : null

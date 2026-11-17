import { createClient } from '@supabase/supabase-js'

// Client "service_role" : contourne la sécurité RLS. À utiliser UNIQUEMENT dans les routes serveur.
export const createAdminClient = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

# Cercle : réseau social Next.js + Supabase

1. Supabase → SQL Editor → collez et exécutez `supabase/schema.sql`
2. (Dev) Authentication → Email → désactivez "Confirm email"
3. Supabase → SQL Editor → exécutez aussi `supabase/messaging.sql` (messagerie)
4. `.env.local` avec l'URL et la clé anon du projet
5. Supabase → SQL Editor → exécutez `supabase/reactions.sql` (réactions + réponses)
6. `npm install && npm run dev` → http://localhost:3000

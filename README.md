# Cercle : réseau social Next.js + Supabase

1. Supabase → SQL Editor → collez et exécutez `supabase/schema.sql`
2. (Dev) Authentication → Email → désactivez "Confirm email"
3. Supabase → SQL Editor → exécutez aussi `supabase/messaging.sql` (messagerie)
4. `.env.local` avec l'URL et la clé anon du projet
5. Supabase → SQL Editor → exécutez `supabase/reactions.sql` (réactions + réponses)
6. `npm install && npm run dev` → http://localhost:3000


plan payant:

hebergement code
hebergement supabase
livekit

+gmail:-----------------
+Ã€ faire hors code
+ExÃ©cuter auth.sql dans le SQL Editor de Supabase, aprÃ¨s privacy.sql. Sans lui, aucun profil nâ€™est crÃ©Ã© aprÃ¨s la confirmation.
+Google Cloud Console : crÃ©ez un OAuth client ID de type Web application. Lâ€™URI de redirection autorisÃ©e est https://<ref>.supabase.co/auth/v1/callback. Copiez le Client ID et le Client Secret dans Supabase â†’ Authentication â†’ Providers â†’ Google.
+Supabase â†’ Authentication â†’ URL Configuration : indiquez le Site URL et ajoutez http://localhost:3000/auth/callback ainsi que lâ€™URL de production dans les Redirect URLs.
+Supabase â†’ Providers â†’ Email : activez Confirm email. Sans cela, signUp renvoie directement une session, et votre code saute lâ€™Ã©tape du code (câ€™est le cas data.session â†’ goHome()).
+Template Â« Confirm signup Â» : remplacez le lien par {{ .Token }}, sinon lâ€™utilisateur reÃ§oit un lien au lieu dâ€™un code.
+SMTP personnalisÃ© (Resend, Brevo, etc.) : le SMTP par dÃ©faut de Supabase est limitÃ© Ã  quelques e-mails par heure, ce qui bloquera vos inscriptions.
+.env.local : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et NEXT_PUBLIC_SITE_URL (surtout en production).



stripe:
Visa – Paiement accepté
Succès

4242 4242 4242 4242
 Copier le numéroChamp	Valeur
Date d'expiration	12/34
CVC	123
Nom	N'importe quel nom
Code postal	101
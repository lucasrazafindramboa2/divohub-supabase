import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import App from '@/components/App'
import CompleteProfile from '@/components/CompleteProfile'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('username, nationality').eq('id', user.id).single()
  const { data: priv } = await supabase.from('user_private').select('user_id').eq('user_id', user.id).maybeSingle()
  // Nationalité ou date de naissance manquante (ex. connexion Google, comptes anciens) : étape de complétion
  if (profile && (!profile.nationality || !priv)) {
    return <CompleteProfile userId={user.id} username={profile.username} needsNationality={!profile.nationality} needsBirthDate={!priv} />
  }
  return <App userId={user.id} username={profile?.username ?? 'Anonyme'} />
}

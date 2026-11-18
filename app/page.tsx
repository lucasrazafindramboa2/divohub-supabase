import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import App from '@/components/App'
import CompleteProfile from '@/components/CompleteProfile'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('username, nationality').eq('id', user.id).single()
  // Compte sans nationalité (ex. première connexion Google) : étape de complétion
  if (profile && !profile.nationality) return <CompleteProfile userId={user.id} username={profile.username} />
  return <App userId={user.id} username={profile?.username ?? 'Anonyme'} />
}

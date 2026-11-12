import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import App from '@/components/App'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('username').eq('id', user.id).single()
  return <App userId={user.id} username={profile?.username ?? 'Anonyme'} />
}

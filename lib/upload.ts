import { createClient } from '@/lib/supabase/client'

export async function uploadImage(file: File, userId: string) {
  const supabase = createClient()
  const ext = file.name.split('.').pop() || 'jpg'
  const path = `${userId}/${Date.now()}.${ext}`
  const { error } = await supabase.storage.from('media').upload(path, file)
  if (error) throw error
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}

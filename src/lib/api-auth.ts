import { createAdminClient } from '@/lib/supabase/admin'

export async function verifyBearerToken(authHeader: string | null) {
  if (!authHeader?.startsWith('Bearer ')) return null

  const token = authHeader.slice(7)
  const supabase = createAdminClient()
  const { data: { user }, error } = await supabase.auth.getUser(token)

  if (error || !user) return null
  return { user, supabase }
}

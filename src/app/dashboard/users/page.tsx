import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UserTable from '@/components/users/UserTable'
import type { Profile } from '@/types/database'

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const { data: users } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  return <UserTable users={(users ?? []) as Profile[]} />
}

'use server'

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import type { UserRole, UserType } from '@/types/database'

async function assertAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autenticado')

  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'admin') throw new Error('Sin permisos')
}

export async function createUser(formData: FormData) {
  await assertAdmin()

  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const full_name = formData.get('full_name') as string
  const user_type = formData.get('user_type') as UserType
  const role = user_type === 'internal' ? formData.get('role') as UserRole : null

  const admin = createAdminClient()
  const { error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, user_type, role },
  })

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/users')
}

export async function updateUser(id: string, formData: FormData) {
  await assertAdmin()

  const full_name = formData.get('full_name') as string
  const user_type = formData.get('user_type') as UserType
  const role = user_type === 'internal' ? formData.get('role') as UserRole : null
  const is_active = formData.get('is_active') === 'true'

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ full_name, user_type, role, is_active })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/users')
}

export async function toggleUserActive(id: string, is_active: boolean) {
  await assertAdmin()

  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update({ is_active })
    .eq('id', id)

  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/users')
}

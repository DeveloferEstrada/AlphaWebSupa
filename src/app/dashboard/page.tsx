import { createClient } from '@/lib/supabase/server'
import type { Profile } from '@/types/database'

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  finance: 'Finanzas',
  operations: 'Operaciones',
  systems: 'Sistemas',
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user!.id)
    .single<Profile>()

  return (
    <div>
      <h1 className="text-2xl font-bold text-[#1e2756] mb-1">
        Bienvenido, {profile?.full_name || user?.email}
      </h1>
      <p className="text-gray-500 text-sm mb-8">
        {profile?.role ? roleLabels[profile.role] : 'Sin rol asignado'} ·{' '}
        {profile?.user_type === 'internal' ? 'Usuario interno' : 'Proveedor'}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
          <p className="text-gray-500 text-sm mb-1">Módulos disponibles</p>
          <p className="text-[#1e2756] text-2xl font-bold">—</p>
          <p className="text-gray-400 text-xs mt-1">Próximamente</p>
        </div>
      </div>
    </div>
  )
}

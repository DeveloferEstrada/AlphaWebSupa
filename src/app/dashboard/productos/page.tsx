import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProductUploadCards from './ProductUploadCards'

export default async function ProductosPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, user_type')
    .eq('id', user.id)
    .single()

  if (
    !profile ||
    profile.user_type !== 'internal' ||
    !['admin', 'operations', 'ventas'].includes(profile.role ?? '')
  ) {
    redirect('/dashboard')
  }

  const today = new Date().toISOString().split('T')[0]

  const { data: todayUploads } = await supabase
    .from('product_file_uploads')
    .select('version, created_at, original_filename, file_date')
    .eq('provider_code', 'CyberPuerta')
    .eq('file_date', today)

  const { data: latestV1 } = await supabase
    .from('product_file_uploads')
    .select('original_filename, file_date')
    .eq('provider_code', 'CyberPuerta')
    .eq('version', 'v1')
    .order('file_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: latestV2 } = await supabase
    .from('product_file_uploads')
    .select('original_filename, file_date')
    .eq('provider_code', 'CyberPuerta')
    .eq('version', 'v2')
    .order('file_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  const v1Today = todayUploads?.find(u => u.version === 'v1')
  const v2Today = todayUploads?.find(u => u.version === 'v2')

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })

  const fmtDate = (d: string) =>
    new Date(d + 'T12:00:00').toLocaleDateString('es-MX', {
      day: 'numeric', month: 'short', year: 'numeric',
    })

  const todayLabel = new Date().toLocaleDateString('es-MX', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1e2756]">Archivos de Productos</h1>
        <p className="text-sm text-gray-500 mt-0.5 capitalize">{todayLabel}</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 text-sm text-blue-700">
        <strong>CyberPuerta</strong> — La API envía V2 si está subida hoy; si no, la última V2 disponible
        (marcada como <em>NO ACTUALIZADO</em>); si tampoco hay V2, envía V1 (marcada como <em>SIN PRECIOS</em>).
      </div>

      <ProductUploadCards
        v1={{
          uploaded: !!v1Today,
          time: v1Today ? fmtTime(v1Today.created_at) : undefined,
          lastAvailable: !v1Today && latestV1
            ? `${latestV1.original_filename ?? 'archivo'} — ${fmtDate(latestV1.file_date)}`
            : undefined,
        }}
        v2={{
          uploaded: !!v2Today,
          time: v2Today ? fmtTime(v2Today.created_at) : undefined,
          lastAvailable: !v2Today && latestV2
            ? `${latestV2.original_filename ?? 'archivo'} — ${fmtDate(latestV2.file_date)}`
            : undefined,
        }}
      />
    </div>
  )
}

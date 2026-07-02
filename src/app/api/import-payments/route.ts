import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { parsePaymentCSV } from '@/lib/walmart'
import { revalidatePath } from 'next/cache'

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, user_type, is_active')
    .eq('id', user.id)
    .single()

  if (
    !profile?.is_active ||
    profile.user_type !== 'internal' ||
    !['admin', 'finance', 'cxc'].includes(profile.role ?? '')
  ) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  // Parse multipart form
  let csvContent: string
  let filename: string
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })
    csvContent = await file.text()
    filename = file.name
  } catch {
    return NextResponse.json({ error: 'Error al leer el archivo' }, { status: 400 })
  }

  // Parse CSV
  const lines = parsePaymentCSV(csvContent)
  if (!lines.length) {
    return NextResponse.json({ error: 'El archivo no contiene líneas de pago válidas.' }, { status: 422 })
  }

  // Derive period id from filename (e.g. "ElecTronix._06-25-2026.csv")
  const filenameDate = filename.match(/(\d{2}-\d{2}-\d{4})/)
  const periodDate = filenameDate
    ? filenameDate[1].replace(/^(\d{2})-(\d{2})-(\d{4})$/, '$3-$1-$2')
    : (lines[0].paymentDate || new Date().toISOString().split('T')[0])
  const requestId = `upload-${periodDate}`

  const admin = createAdminClient()

  // Build rows without raw_line to keep payload small
  const rows = lines.map(l => ({
    request_id: requestId,
    payment_date: l.paymentDate || null,
    order_number: l.orderNumber || null,
    amount: l.amount,
    concepto: l.concepto,
    ingreso_egreso: l.ingresoEgreso,
    invoice_ref: l.invoiceRef || null,
    fulfillment_model: l.fulfillmentModel || null,
  }))

  await admin.from('walmart_payments').delete().eq('request_id', requestId)

  // Insert in chunks of 500
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await admin.from('walmart_payments').insert(rows.slice(i, i + CHUNK))
    if (error) return NextResponse.json({ error: `DB error: ${error.message}` }, { status: 500 })
  }

  await admin.from('walmart_payment_requests').upsert({
    request_id: requestId,
    status: 'PROCESSED',
    completed_at: new Date().toISOString(),
    rows_imported: lines.length,
  }, { onConflict: 'request_id' })

  revalidatePath('/dashboard/cxc')
  return NextResponse.json({ synced: lines.length })
}

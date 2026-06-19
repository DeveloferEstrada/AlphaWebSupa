import { verifyBearerToken } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const auth = await verifyBearerToken(request.headers.get('Authorization'))
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('provider_code')
    .eq('id', auth.user.id)
    .single()

  const providerCode = profile?.provider_code
  if (!providerCode) {
    return NextResponse.json(
      { error: 'Token inválido: no se encontró el proveedor.' },
      { status: 401 }
    )
  }

  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  // 1. V2 subida hoy
  const { data: v2Today } = await supabase
    .from('product_file_uploads')
    .select('storage_path, file_date, version')
    .eq('provider_code', providerCode)
    .eq('version', 'v2')
    .eq('file_date', today)
    .maybeSingle()

  let fileRecord = v2Today
  let isUpdated = !!v2Today
  let version: 'v1' | 'v2' = 'v2'

  // 2. Última V2 disponible
  if (!v2Today) {
    const { data: latestV2 } = await supabase
      .from('product_file_uploads')
      .select('storage_path, file_date, version')
      .eq('provider_code', providerCode)
      .eq('version', 'v2')
      .order('file_date', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (latestV2) {
      fileRecord = latestV2
    } else {
      // 3. Última V1 disponible
      const { data: latestV1 } = await supabase
        .from('product_file_uploads')
        .select('storage_path, file_date, version')
        .eq('provider_code', providerCode)
        .eq('version', 'v1')
        .order('file_date', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestV1) {
        fileRecord = latestV1
        version = 'v1'
      }
    }
  }

  if (!fileRecord) {
    return NextResponse.json(
      { error: 'No hay archivos disponibles para este proveedor.' },
      { status: 404 }
    )
  }

  const { data: fileBlob, error: downloadError } = await supabase.storage
    .from('productos')
    .download(fileRecord.storage_path)

  if (downloadError || !fileBlob) {
    return NextResponse.json({ error: 'Error al descargar archivo.' }, { status: 500 })
  }

  let filename: string
  if (version === 'v1') {
    filename = `productos_${providerCode}_v1_SIN_PRECIOS_${fileRecord.file_date}.xlsx`
  } else if (!isUpdated) {
    filename = `productos_${providerCode}_v2_${fileRecord.file_date}_NO_ACTUALIZADO.xlsx`
  } else {
    filename = `productos_${providerCode}_${today}.xlsx`
  }

  const buffer = await fileBlob.arrayBuffer()

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-File-Version': fileRecord.version,
      'X-File-Date': fileRecord.file_date,
      'X-Is-Updated': String(isUpdated),
    },
  })
}

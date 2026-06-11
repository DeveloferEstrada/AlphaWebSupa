import { verifyBearerToken } from '@/lib/api-auth'
import { NextResponse, type NextRequest } from 'next/server'

const CIB_URL = 'http://200.188.56.106:4080/Art-Cib'

export async function GET(request: NextRequest) {
  const auth = await verifyBearerToken(request.headers.get('Authorization'))
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const body = await request.json().catch(() => null)
  const sku = String(body?.SKU ?? '').trim()

  if (!sku) {
    return NextResponse.json({ error: 'SKU es requerido.' }, { status: 400 })
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('provider_code')
    .eq('id', auth.user.id)
    .single()

  const proveedor = profile?.provider_code
  if (!proveedor) {
    return NextResponse.json(
      { error: 'Token inválido: no se encontró el proveedor (unique_name).' },
      { status: 401 }
    )
  }

  // JSON con Formatting.Indented (2 espacios) — idéntico al original con Newtonsoft.Json
  const jsonPayload = JSON.stringify({ Proveedor: proveedor, SKU: sku }, null, 2)

  try {
    const response = await fetch(CIB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: jsonPayload,
      signal: AbortSignal.timeout(30_000),
    })

    const responseText = await response.text()

    // Passthrough idéntico — mismo status, mismo body
    return new NextResponse(responseText, {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (ex: unknown) {
    return NextResponse.json(
      { error: 'Error llamando Art-Cib.', detail: String(ex) },
      { status: 502 }
    )
  }
}

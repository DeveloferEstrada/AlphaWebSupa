import { verifyBearerToken } from '@/lib/api-auth'
import { NextResponse, type NextRequest } from 'next/server'

const CIB_URL = 'http://200.188.56.106:4080/Art-Cib'

async function handleRequest(request: NextRequest) {
  const auth = await verifyBearerToken(request.headers.get('Authorization'))
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  // SKU: body (POST) → query param → vacío
  // Vercel descarta body en GET, por eso también aceptamos ?SKU=
  const body = await request.json().catch(() => null)
  const sku = String(
    body?.SKU ?? body?.sku ??
    request.nextUrl.searchParams.get('SKU') ??
    request.nextUrl.searchParams.get('sku') ?? ''
  ).trim()

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

// GET original (clientes existentes) — SKU vía query param: ?SKU=36233631
export async function GET(request: NextRequest) {
  return handleRequest(request)
}

// POST alias — SKU vía body: {"SKU": "36233631"}
export async function POST(request: NextRequest) {
  return handleRequest(request)
}

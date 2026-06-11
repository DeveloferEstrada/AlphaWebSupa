import { verifyBearerToken } from '@/lib/api-auth'
import { NextResponse, type NextRequest } from 'next/server'

const CIB_URL = 'http://200.188.56.106:4080/Ord-Cib'

interface CreateOrderProduct {
  sku: string
  quantity: number
}

interface CreateOrderRequest {
  purchase_order_number: string
  warehouse: number
  products: CreateOrderProduct[]
}

export async function POST(request: NextRequest) {
  const auth = await verifyBearerToken(request.headers.get('Authorization'))
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const body: CreateOrderRequest | null = await request.json().catch(() => null)

  if (!body?.purchase_order_number) {
    return NextResponse.json({ error: 'purchase_order_number es requerido.' }, { status: 400 })
  }
  if (typeof body.warehouse !== 'number') {
    return NextResponse.json({ error: 'warehouse es requerido.' }, { status: 400 })
  }
  if (!Array.isArray(body.products) || body.products.length === 0) {
    return NextResponse.json({ error: 'products debe incluir al menos 1 elemento.' }, { status: 400 })
  }

  // Re-enviar como JSON indentado (idéntico a Newtonsoft Formatting.Indented)
  const jsonPayload = JSON.stringify(body, null, 2)

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
      { error: 'Error llamando Ord-Cib.', detail: String(ex) },
      { status: 502 }
    )
  }
}

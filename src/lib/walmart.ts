const BASE_URL = process.env.WALMART_BASE_URL ?? 'https://marketplace.walmartapis.com'
const MARKET = process.env.WALMART_MARKET ?? 'mx'

function cid() {
  return crypto.randomUUID()
}

export async function getWalmartToken(): Promise<string> {
  const clientId = process.env.WALMART_CLIENT_ID!
  const clientSecret = process.env.WALMART_CLIENT_SECRET!
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(`${BASE_URL}/v3/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'WM_MARKET': MARKET,
      'WM_QOS.CORRELATION_ID': cid(),
      'WM_SVC.NAME': 'MegaAudio CXC',
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Walmart auth error (${res.status}): ${text}`)
  }

  const data = await res.json()
  const token = data.access_token as string
  if (!token) {
    throw new Error(`Walmart auth: token vacío. Respuesta: ${JSON.stringify(data)}`)
  }
  return token
}

export interface WalmartOrdersPage {
  orders: WalmartOrder[]
  nextCursor?: string
  totalCount?: number
}

export interface WalmartOrder {
  purchaseOrderId: string
  customerOrderId: string
  status: string
  orderDate: string
  orderLines: WalmartOrderLine[]
  raw: unknown
}

export interface WalmartOrderLine {
  lineNumber: string
  sku: string
  productName: string
  quantity: number
  unitPrice: number
  totalPrice: number
  status: string
}

export async function fetchOrdersPage(
  token: string,
  startDate: string,
  endDate: string,
  nextCursor?: string
): Promise<WalmartOrdersPage> {
  const params = new URLSearchParams({
    createdStartDate: startDate,
    createdEndDate: endDate,
    limit: '100',
  })
  if (nextCursor) params.set('nextCursor', nextCursor)

  const res = await fetch(`${BASE_URL}/v3/orders?${params}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'WM_SEC.ACCESS_TOKEN': token,
      'WM_MARKET': MARKET,
      'WM_QOS.CORRELATION_ID': cid(),
      'WM_SVC.NAME': 'MegaAudio CXC',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  })

  if (!res.ok) {
    const text = await res.text()
    const tokenPreview = token.slice(0, 30)
    throw new Error(`Walmart orders error (${res.status}) token[${tokenPreview}]: ${text}`)
  }

  const json = await res.json()

  // Walmart wraps response in list.elements.order[]
  const meta = json?.list?.meta ?? {}
  const rawOrders: unknown[] = json?.list?.elements?.order ?? []

  const orders: WalmartOrder[] = rawOrders.map((o: unknown) => {
    const order = o as Record<string, unknown>
    const lines: WalmartOrderLine[] = []

    const rawLines =
      (order?.orderLines as Record<string, unknown>)?.orderLine ?? []
    const lineArr = Array.isArray(rawLines) ? rawLines : [rawLines]

    for (const l of lineArr as Record<string, unknown>[]) {
      const charges =
        ((l?.charges as Record<string, unknown>)?.charge as unknown[]) ?? []
      const chargeArr = Array.isArray(charges) ? charges : [charges]

      let unitPrice = 0
      let totalPrice = 0
      for (const c of chargeArr as Record<string, unknown>[]) {
        if ((c?.chargeType as string) === 'PRODUCT') {
          unitPrice = Number((c?.chargeAmount as Record<string, unknown>)?.amount ?? 0)
        }
        if ((c?.chargeType as string) === 'PRODUCT') {
          totalPrice += unitPrice
        }
      }

      const qty = Number(
        (l?.orderLineQuantity as Record<string, unknown>)?.amount ?? 1
      )
      totalPrice = unitPrice * qty

      const lineStatuses =
        (
          (l?.orderLineStatuses as Record<string, unknown>)
            ?.orderLineStatus as unknown[]
        ) ?? []
      const statusArr = Array.isArray(lineStatuses)
        ? lineStatuses
        : [lineStatuses]
      const lineStatus =
        ((statusArr[0] as Record<string, unknown>)?.status as string) ?? ''

      lines.push({
        lineNumber: String(l?.lineNumber ?? ''),
        sku: String((l?.item as Record<string, unknown>)?.sku ?? ''),
        productName: String(
          (l?.item as Record<string, unknown>)?.productName ?? ''
        ),
        quantity: qty,
        unitPrice,
        totalPrice,
        status: lineStatus,
      })
    }

    const orderTotal = lines.reduce((sum, l) => sum + l.totalPrice, 0)

    return {
      purchaseOrderId: String(order?.purchaseOrderId ?? ''),
      customerOrderId: String(order?.customerOrderId ?? ''),
      status: String(order?.status ?? ''),
      orderDate: String(order?.orderDate ?? ''),
      orderLines: lines,
      raw: o,
      _total: orderTotal,
    } as WalmartOrder & { _total: number }
  })

  return {
    orders,
    nextCursor: meta.nextCursor as string | undefined,
    totalCount: meta.totalCount as number | undefined,
  }
}

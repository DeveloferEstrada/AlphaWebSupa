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
  // Response field is nextCursorMark; request parameter is nextCursor
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

  // MX production: { meta: { totalCount, limit, nextCursorMark }, order: [...] }
  const meta = json?.meta ?? json?.list?.meta ?? {}
  const rawOrders: unknown[] = json?.order ?? json?.list?.elements?.order ?? []

  const orders: WalmartOrder[] = rawOrders.map((o: unknown) => {
    const order = o as Record<string, unknown>
    const lines: WalmartOrderLine[] = []

    // MX production: orderLines is a direct array. US: orderLines.orderLine
    const rawLinesData = order?.orderLines
    const lineArr: Record<string, unknown>[] = Array.isArray(rawLinesData)
      ? (rawLinesData as Record<string, unknown>[])
      : (((rawLinesData as Record<string, unknown>)?.orderLine as unknown[]) ?? []) as Record<string, unknown>[]

    for (const l of lineArr) {
      // MX production: charges is a direct array. US: charges.charge
      const chargesData = l?.charges
      const chargeArr: Record<string, unknown>[] = Array.isArray(chargesData)
        ? (chargesData as Record<string, unknown>[])
        : (((chargesData as Record<string, unknown>)?.charge as unknown[]) ?? []) as Record<string, unknown>[]

      let unitPrice = 0
      for (const c of chargeArr) {
        if ((c?.chargeType as string) === 'PRODUCT') {
          unitPrice = Number((c?.chargeAmount as Record<string, unknown>)?.amount ?? 0)
        }
      }

      const qty = Number((l?.orderLineQuantity as Record<string, unknown>)?.amount ?? 1)
      const totalPrice = unitPrice * qty

      // MX production: orderLineStatus is a direct array. US: orderLineStatuses.orderLineStatus
      const lineStatusData = l?.orderLineStatus
        ?? (l?.orderLineStatuses as Record<string, unknown>)?.orderLineStatus
      const statusArr: Record<string, unknown>[] = Array.isArray(lineStatusData)
        ? (lineStatusData as Record<string, unknown>[])
        : lineStatusData ? [lineStatusData as Record<string, unknown>] : []
      const lineStatus = (statusArr[0]?.status as string) ?? ''

      lines.push({
        lineNumber: String(l?.primeLineNumber ?? l?.lineNumber ?? l?.coLineNumber ?? ''),
        sku: String((l?.item as Record<string, unknown>)?.sku ?? ''),
        productName: String((l?.item as Record<string, unknown>)?.productName ?? ''),
        quantity: qty,
        unitPrice,
        totalPrice,
        status: lineStatus,
      })
    }

    // MX production: orderTotal.amount exists directly. Fallback: sum lines.
    const orderTotal = order?.orderTotal
      ? Number((order.orderTotal as Record<string, unknown>)?.amount ?? 0)
      : lines.reduce((sum, l) => sum + l.totalPrice, 0)

    // MX production: no top-level status field; derive from first line.
    const orderStatus = (order?.status as string) || (lines[0]?.status ?? '')

    return {
      purchaseOrderId: String(order?.purchaseOrderId ?? ''),
      customerOrderId: String(order?.customerOrderId ?? ''),
      status: orderStatus,
      orderDate: String(order?.orderDate ?? ''),
      orderLines: lines,
      raw: o,
      _total: orderTotal,
    } as WalmartOrder & { _total: number }
  })

  return {
    orders,
    nextCursor: (meta.nextCursorMark ?? meta.nextCursor) as string | undefined,
    totalCount: meta.totalCount as number | undefined,
  }
}

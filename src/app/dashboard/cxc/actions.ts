'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  getWalmartToken,
  fetchOrdersPage,
  fetchAvailableReconDates,
  fetchReconReport,
  requestAsyncPaymentReport,
  checkAsyncPaymentReport,
  downloadAsyncPaymentReport,
  parsePaymentCSV,
  WalmartOrder,
  PaymentLine,
} from '@/lib/walmart'
import { revalidatePath } from 'next/cache'

async function requireCxcUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado.')

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
    throw new Error('Sin permiso.')
  }
}

// ─── Orders ──────────────────────────────────────────────────────

export async function syncWalmartOrders(): Promise<{ synced: number; error?: string }> {
  await requireCxcUser()
  const token = await getWalmartToken()
  const admin = createAdminClient()

  const startDate = '2024-01-01T00:00:00.000Z'
  const endDate = new Date().toISOString()

  let cursor: string | undefined
  let totalSynced = 0
  const MAX_PAGES = 50

  for (let page = 0; page < MAX_PAGES; page++) {
    const { orders, nextCursor } = await fetchOrdersPage(token, startDate, endDate, cursor)

    if (!orders.length) break

    for (const order of orders) {
      const orderTotal = (order as WalmartOrder & { _total: number })._total
        ?? order.orderLines.reduce((sum, l) => sum + l.totalPrice, 0)

      await admin.from('walmart_orders').upsert(
        {
          purchase_order_id: order.purchaseOrderId,
          customer_order_id: order.customerOrderId,
          status: order.status,
          order_date: order.orderDate || null,
          total_amount: orderTotal,
          currency: 'MXN',
          raw_data: order.raw,
          synced_at: new Date().toISOString(),
        },
        { onConflict: 'purchase_order_id' }
      )

      if (order.orderLines.length > 0) {
        await admin.from('walmart_order_lines').delete()
          .eq('purchase_order_id', order.purchaseOrderId)

        await admin.from('walmart_order_lines').insert(
          order.orderLines.map(l => ({
            purchase_order_id: order.purchaseOrderId,
            line_number: l.lineNumber,
            sku: l.sku,
            product_name: l.productName,
            quantity: l.quantity,
            unit_price: l.unitPrice,
            total_price: l.totalPrice,
            status: l.status,
          }))
        )
      }

      totalSynced++
    }

    // '*' is Solr's initial cursor — if returned again, there are no more pages
    if (!nextCursor || nextCursor === '*' || nextCursor === cursor) break
    cursor = nextCursor
  }

  revalidatePath('/dashboard/cxc')
  return { synced: totalSynced }
}

// ─── Payments ────────────────────────────────────────────────────

function paymentLinesToRows(lines: PaymentLine[], requestId: string) {
  return lines.map(l => ({
    request_id: requestId,
    payment_date: l.paymentDate || null,
    order_number: l.orderNumber || null,
    amount: l.amount,
    concepto: l.concepto,
    ingreso_egreso: l.ingresoEgreso,
    invoice_ref: l.invoiceRef || null,
    fulfillment_model: l.fulfillmentModel || null,
    raw_line: l.raw,
  }))
}

export interface PaymentRequestResult {
  method: 'legacy' | 'async'
  requestId?: string
  synced?: number
  error?: string
}

export async function requestWalmartPayments(): Promise<PaymentRequestResult> {
  await requireCxcUser()
  const token = await getWalmartToken()
  const admin = createAdminClient()

  // Strategy 1: legacy GET (synchronous — instant if supported by MX)
  try {
    const dates = await fetchAvailableReconDates(token)
    if (dates.length > 0) {
      let total = 0
      for (const d of dates.slice(0, 6)) {
        const csv = await fetchReconReport(token, d)
        const lines = parsePaymentCSV(csv)
        if (!lines.length) continue

        const rid = `legacy-${d}`
        await admin.from('walmart_payments').delete().eq('request_id', rid)
        await admin.from('walmart_payments').insert(paymentLinesToRows(lines, rid))
        await admin.from('walmart_payment_requests').upsert({
          request_id: rid,
          status: 'PROCESSED',
          completed_at: new Date().toISOString(),
          rows_imported: lines.length,
        }, { onConflict: 'request_id' })

        total += lines.length
      }
      revalidatePath('/dashboard/cxc')
      return { method: 'legacy', synced: total }
    }
  } catch {
    // Legacy endpoint not supported for MX — fall through to async
  }

  // Strategy 2: async on-request reports API
  const requestId = await requestAsyncPaymentReport(token)
  await admin.from('walmart_payment_requests').upsert({
    request_id: requestId,
    status: 'RECEIVED',
    requested_at: new Date().toISOString(),
    rows_imported: 0,
  }, { onConflict: 'request_id' })

  return { method: 'async', requestId }
}

export async function pollWalmartPaymentReport(
  requestId: string
): Promise<{ status: string; ready: boolean; rows?: number; error?: string }> {
  await requireCxcUser()
  const token = await getWalmartToken()
  const admin = createAdminClient()

  const { status, downloadURL } = await checkAsyncPaymentReport(token, requestId)

  await admin.from('walmart_payment_requests')
    .update({ status })
    .eq('request_id', requestId)

  if ((status === 'READY' || status === 'COMPLETED') && downloadURL) {
    const csv = await downloadAsyncPaymentReport(downloadURL)
    const lines = parsePaymentCSV(csv)

    await admin.from('walmart_payments').delete().eq('request_id', requestId)
    if (lines.length) {
      await admin.from('walmart_payments').insert(paymentLinesToRows(lines, requestId))
    }

    await admin.from('walmart_payment_requests').update({
      status: 'PROCESSED',
      completed_at: new Date().toISOString(),
      rows_imported: lines.length,
    }).eq('request_id', requestId)

    revalidatePath('/dashboard/cxc')
    return { status: 'PROCESSED', ready: true, rows: lines.length }
  }

  if (status === 'ERROR' || status === 'FAILED') {
    return { status, ready: false, error: 'El reporte falló en Walmart. Intenta nuevamente.' }
  }

  return { status, ready: false }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getWalmartToken, fetchOrdersPage } from '@/lib/walmart'
import { revalidatePath } from 'next/cache'

export async function syncWalmartOrders(): Promise<{ synced: number; error?: string }> {
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
    throw new Error('Sin permiso para sincronizar.')
  }

  const token = await getWalmartToken()
  const admin = createAdminClient()

  const startDate = '2024-01-01T00:00:00.000Z'
  const endDate = new Date().toISOString()

  let cursor: string | undefined
  let totalSynced = 0
  const MAX_PAGES = 10

  for (let page = 0; page < MAX_PAGES; page++) {
    const { orders, nextCursor } = await fetchOrdersPage(token, startDate, endDate, cursor)

    if (!orders.length) break

    for (const order of orders) {
      const orderTotal = order.orderLines.reduce((sum, l) => sum + l.totalPrice, 0)

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

    if (!nextCursor) break
    cursor = nextCursor
  }

  revalidatePath('/dashboard/cxc')
  return { synced: totalSynced }
}

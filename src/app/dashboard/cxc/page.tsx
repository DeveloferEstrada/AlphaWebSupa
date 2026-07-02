import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import CxcDashboard from './CxcDashboard'

export default async function CxcPage() {
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
    !['admin', 'finance', 'cxc'].includes(profile.role ?? '')
  ) {
    redirect('/dashboard')
  }

  const admin = createAdminClient()

  // Sync state
  const { data: syncState } = await admin
    .from('walmart_sync_state')
    .select('orders_synced_until')
    .eq('id', 1)
    .maybeSingle()

  // Orders — paginate in 1000-row chunks to bypass PostgREST max-rows cap
  const PAGE_SIZE = 1000
  const allOrders: {
    purchase_order_id: string
    customer_order_id: string
    status: string
    order_date: string
    total_amount: number
    synced_at: string
  }[] = []
  let from = 0
  while (true) {
    const { data: page, error: ordersError } = await admin
      .from('walmart_orders')
      .select('purchase_order_id, customer_order_id, status, order_date, total_amount, synced_at')
      .order('order_date', { ascending: false })
      .range(from, from + PAGE_SIZE - 1)
    if (ordersError) { console.error('[CxcPage] orders error:', ordersError.message); break }
    if (!page?.length) break
    allOrders.push(...page)
    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }
  const orders = allOrders

  // Last payment request
  const { data: lastPaymentReq } = await admin
    .from('walmart_payment_requests')
    .select('request_id, status, rows_imported, requested_at, completed_at')
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Payment lines — paginate to load all rows (CSV can exceed 5000 rows)
  const allPaymentLines: {
    payment_date: string
    order_number: string
    concepto: string
    ingreso_egreso: string
    amount: number
  }[] = []
  let pmFrom = 0
  while (true) {
    const { data: pmPage, error: pmError } = await admin
      .from('walmart_payments')
      .select('payment_date, order_number, concepto, ingreso_egreso, amount')
      .order('payment_date', { ascending: false })
      .range(pmFrom, pmFrom + PAGE_SIZE - 1)
    if (pmError) { console.error('[CxcPage] payments error:', pmError.message); break }
    if (!pmPage?.length) break
    allPaymentLines.push(...pmPage)
    if (pmPage.length < PAGE_SIZE) break
    pmFrom += PAGE_SIZE
  }
  const paymentLines = allPaymentLines

  const totalAmount = (orders ?? []).reduce((sum, o) => sum + (Number(o.total_amount) ?? 0), 0)
  const lastSynced = orders?.[0]?.synced_at ?? undefined

  const syncedUntil = syncState?.orders_synced_until ?? '2024-01-01T00:00:00Z'
  const syncDone = new Date(syncedUntil) >= new Date()

  return (
    <CxcDashboard
      orders={orders ?? []}
      totalAmount={totalAmount}
      lastSynced={lastSynced}
      syncedUntil={syncedUntil}
      syncDone={syncDone}
      lastPaymentRequest={lastPaymentReq ?? null}
      paymentLines={paymentLines ?? []}
    />
  )
}

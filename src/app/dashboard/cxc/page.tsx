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

  // Orders — limit 50 000 to bypass PostgREST default of 1 000
  const { data: orders, error: ordersError } = await admin
    .from('walmart_orders')
    .select('purchase_order_id, customer_order_id, status, order_date, total_amount, synced_at')
    .order('order_date', { ascending: false })
    .limit(50_000)
  if (ordersError) console.error('[CxcPage] orders error:', ordersError.message)

  // Last payment request
  const { data: lastPaymentReq } = await admin
    .from('walmart_payment_requests')
    .select('request_id, status, rows_imported, requested_at, completed_at')
    .order('requested_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Payment lines (last 1000 rows for display)
  const { data: paymentLines } = await admin
    .from('walmart_payments')
    .select('payment_date, order_number, concepto, ingreso_egreso, amount')
    .order('created_at', { ascending: false })
    .limit(1000)

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

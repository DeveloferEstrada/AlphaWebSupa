import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
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

  const { data: orders } = await supabase
    .from('walmart_orders')
    .select('purchase_order_id, customer_order_id, status, order_date, total_amount, synced_at')
    .order('order_date', { ascending: false })

  const totalAmount = (orders ?? []).reduce((sum, o) => sum + (o.total_amount ?? 0), 0)
  const lastSynced = orders?.[0]?.synced_at

  return (
    <CxcDashboard
      orders={orders ?? []}
      totalAmount={totalAmount}
      lastSynced={lastSynced}
    />
  )
}

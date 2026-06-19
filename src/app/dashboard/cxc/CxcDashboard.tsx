'use client'

import { Fragment, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { syncWalmartOrders } from './actions'

interface Order {
  purchase_order_id: string
  customer_order_id: string
  status: string
  order_date: string
  total_amount: number
  synced_at: string
}

interface Props {
  orders: Order[]
  totalAmount: number
  lastSynced?: string
}

const STATUS_COLORS: Record<string, string> = {
  Created: 'bg-blue-100 text-blue-700',
  Acknowledged: 'bg-yellow-100 text-yellow-700',
  Shipped: 'bg-purple-100 text-purple-700',
  Delivered: 'bg-green-100 text-green-700',
  Cancelled: 'bg-red-100 text-red-700',
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function fmtMXN(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
}

export default function CxcDashboard({ orders, totalAmount, lastSynced }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [syncMsg, setSyncMsg] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState<string | null>(null)

  function handleSync() {
    setSyncMsg(null)
    startTransition(async () => {
      try {
        const result = await syncWalmartOrders()
        setSyncMsg(`Sincronización completada — ${result.synced} órdenes actualizadas.`)
        router.refresh()
      } catch (err: unknown) {
        setSyncMsg(`Error: ${err instanceof Error ? err.message : 'Error inesperado'}`)
      }
    })
  }

  const filtered = orders.filter(o => {
    const matchSearch =
      !search ||
      o.purchase_order_id.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_order_id?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || o.status === statusFilter
    return matchSearch && matchStatus
  })

  const statuses = [...new Set(orders.map(o => o.status).filter(Boolean))]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#1e2756]">Cuentas por Cobrar — Walmart</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {lastSynced ? `Última sync: ${fmtDate(lastSynced)}` : 'Sin sincronización aún'}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={isPending}
          className="bg-[#1e2756] hover:bg-[#16204a] disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          {isPending ? 'Sincronizando...' : '↻ Sincronizar Walmart'}
        </button>
      </div>

      {syncMsg && (
        <div className={`text-sm rounded-lg px-4 py-3 ${syncMsg.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {syncMsg}
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Total órdenes</p>
          <p className="text-2xl font-bold text-[#1e2756] mt-1">{orders.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Monto total</p>
          <p className="text-xl font-bold text-[#1e2756] mt-1">{fmtMXN(totalAmount)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Entregadas</p>
          <p className="text-2xl font-bold text-green-600 mt-1">
            {orders.filter(o => o.status === 'Delivered').length}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500">Canceladas</p>
          <p className="text-2xl font-bold text-red-500 mt-1">
            {orders.filter(o => o.status === 'Cancelled').length}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          type="text"
          placeholder="Buscar por # orden..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2756] w-56"
        />
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2756]"
        >
          <option value="">Todos los estados</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {(search || statusFilter) && (
          <button onClick={() => { setSearch(''); setStatusFilter('') }}
            className="text-sm text-gray-500 hover:text-gray-700 underline">
            Limpiar
          </button>
        )}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
          {orders.length === 0
            ? 'Sin órdenes. Haz clic en "Sincronizar Walmart" para cargar datos.'
            : 'Sin resultados para los filtros seleccionados.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-500">PO #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Cliente OC #</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Estado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(order => (
                <Fragment key={order.purchase_order_id}>
                  <tr
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => setExpanded(expanded === order.purchase_order_id ? null : order.purchase_order_id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs text-gray-600">{order.purchase_order_id}</td>
                    <td className="px-4 py-3 text-gray-600">{order.customer_order_id || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{fmtDate(order.order_date)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[order.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {order.status || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[#1e2756]">
                      {order.total_amount ? fmtMXN(order.total_amount) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-400 text-xs">
                      {expanded === order.purchase_order_id ? '▲' : '▼'}
                    </td>
                  </tr>
                  {expanded === order.purchase_order_id && (
                    <tr>
                      <td colSpan={6} className="px-4 pb-4 bg-gray-50">
                        <OrderDetail purchaseOrderId={order.purchase_order_id} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function OrderDetail({ purchaseOrderId }: { purchaseOrderId: string }) {
  return (
    <div className="mt-2 text-xs text-gray-500">
      <span className="font-medium text-gray-700">PO:</span> {purchaseOrderId} —
      detalles de líneas disponibles en la siguiente versión.
    </div>
  )
}

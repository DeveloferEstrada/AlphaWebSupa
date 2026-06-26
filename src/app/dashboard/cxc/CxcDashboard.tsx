'use client'

import { Fragment, useState, useTransition, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useRef } from 'react'
import { syncWalmartOrders, requestWalmartPayments, pollWalmartPaymentReport, importPaymentCSV } from './actions'

interface Order {
  purchase_order_id: string
  customer_order_id: string
  status: string
  order_date: string
  total_amount: number
  synced_at: string
}

interface PaymentLineRow {
  payment_date: string
  order_number: string
  concepto: string
  ingreso_egreso: string
  amount: number
}

interface PaymentRequest {
  request_id: string
  status: string
  rows_imported: number
  requested_at: string
  completed_at?: string
}

interface Props {
  orders: Order[]
  totalAmount: number
  lastSynced?: string
  syncedUntil: string
  syncDone: boolean
  lastPaymentRequest: PaymentRequest | null
  paymentLines: PaymentLineRow[]
}

type DatePreset = '7d' | 'mes' | 'mes_ant' | '90d' | 'todo'
const DATE_PRESETS: [DatePreset, string][] = [
  ['7d', '7 días'], ['mes', 'Este mes'], ['mes_ant', 'Mes anterior'], ['90d', '90 días'], ['todo', 'Todo'],
]
const PAGE_SIZE = 200

function presetRange(p: DatePreset): { from?: Date; to?: Date } {
  const now = new Date()
  if (p === '7d') return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6) }
  if (p === 'mes') return { from: new Date(now.getFullYear(), now.getMonth(), 1) }
  if (p === 'mes_ant') {
    const m0 = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: new Date(m0.getFullYear(), m0.getMonth() - 1, 1), to: new Date(m0.getTime() - 1) }
  }
  if (p === '90d') return { from: new Date(now.getFullYear(), now.getMonth(), now.getDate() - 89) }
  return {}
}

const STATUS_COLORS: Record<string, string> = {
  Created: 'bg-blue-100 text-blue-700',
  Acknowledged: 'bg-yellow-100 text-yellow-700',
  Shipped: 'bg-purple-100 text-purple-700',
  Delivered: 'bg-green-100 text-green-700',
  Cancelled: 'bg-red-100 text-red-700',
}

const CONCEPTO_COLORS: Record<string, string> = {
  Venta: 'bg-green-100 text-green-700',
  Comision: 'bg-orange-100 text-orange-700',
  'Costo de envio': 'bg-blue-100 text-blue-700',
  'Retencion ISR': 'bg-red-100 text-red-700',
  'Retencion IVA': 'bg-red-100 text-red-700',
  Killer: 'bg-purple-100 text-purple-700',
  Reclamo: 'bg-yellow-100 text-yellow-700',
  WFS: 'bg-sky-100 text-sky-700',
}

function fmtDate(iso: string) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fmtMXN(n: number) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
}

function conceptoColor(c: string) {
  for (const key of Object.keys(CONCEPTO_COLORS)) {
    if (c.includes(key)) return CONCEPTO_COLORS[key]
  }
  return 'bg-gray-100 text-gray-600'
}

const ASYNC_PENDING = ['RECEIVED', 'INPROGRESS', 'IN_PROGRESS', 'PENDING']

export default function CxcDashboard({
  orders, totalAmount, lastSynced, syncedUntil, syncDone,
  lastPaymentRequest, paymentLines,
}: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'orders' | 'payments'>('orders')
  const [isPending, startTransition] = useTransition()
  const [msg, setMsg] = useState<string | null>(null)

  // Orders state
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [datePreset, setDatePreset] = useState<DatePreset>('90d')
  const [tablePage, setTablePage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => { setTablePage(0) }, [search, statusFilter, datePreset])

  // Payments state
  const [payReq, setPayReq] = useState<PaymentRequest | null>(lastPaymentRequest)
  const [isPolling, setIsPolling] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isAsyncPending = payReq && ASYNC_PENDING.includes(payReq.status)

  // Poll async report every 60s while pending
  const poll = useCallback(async () => {
    if (!payReq?.request_id || !ASYNC_PENDING.includes(payReq.status)) return
    try {
      const result = await pollWalmartPaymentReport(payReq.request_id)
      setPayReq(prev => prev ? { ...prev, status: result.status, rows_imported: result.rows ?? prev.rows_imported } : prev)
      if (result.ready) {
        setMsg(`Reporte procesado — ${result.rows} líneas importadas.`)
        router.refresh()
      }
    } catch (err) {
      setMsg(`Error al verificar: ${err instanceof Error ? err.message : 'Error inesperado'}`)
    }
  }, [payReq, router])

  useEffect(() => {
    if (!isAsyncPending) return
    setIsPolling(true)
    const id = setInterval(poll, 60_000)
    return () => { clearInterval(id); setIsPolling(false) }
  }, [isAsyncPending, poll])

  function handleSyncOrders() {
    setMsg(null)
    startTransition(async () => {
      try {
        const result = await syncWalmartOrders()
        if (result.done) {
          setMsg(`Historial completo. ${result.synced} órdenes sincronizadas (${result.period}).`)
        } else {
          setMsg(`${result.synced} órdenes cargadas — ${result.period}. Haz clic de nuevo para continuar.`)
        }
        router.refresh()
      } catch (err: unknown) {
        setMsg(`Error: ${err instanceof Error ? err.message : 'Error inesperado'}`)
      }
    })
  }

  function handleRequestPayments() {
    setMsg(null)
    startTransition(async () => {
      try {
        const result = await requestWalmartPayments()
        if (result.method === 'legacy') {
          if (result.error) {
            setMsg(`Error: ${result.error}`)
          } else {
            setMsg(`Pagos sincronizados — ${result.synced} líneas importadas.`)
            router.refresh()
          }
        } else {
          setPayReq({ request_id: result.requestId!, status: 'RECEIVED', rows_imported: 0, requested_at: new Date().toISOString() })
          setMsg('Reporte solicitado. Walmart lo generará en ~15-45 min. La página verificará automáticamente.')
        }
      } catch (err: unknown) {
        setMsg(`Error: ${err instanceof Error ? err.message : 'Error inesperado'}`)
      }
    })
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setMsg(null)
    const reader = new FileReader()
    reader.onload = () => {
      const content = reader.result as string
      startTransition(async () => {
        try {
          const result = await importPaymentCSV(content, file.name)
          if (result.error) {
            setMsg(`Error: ${result.error}`)
          } else {
            setMsg(`${result.synced} líneas importadas de "${file.name}".`)
            router.refresh()
          }
        } catch (err) {
          setMsg(`Error: ${err instanceof Error ? err.message : 'Error inesperado'}`)
        }
      })
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  function handleManualPoll() {
    setMsg(null)
    startTransition(async () => {
      await poll()
    })
  }

  // Orders filtered
  const statuses = [...new Set(orders.map(o => o.status).filter(Boolean))]
  const { from: dateFrom, to: dateTo } = presetRange(datePreset)
  const filtered = orders.filter(o => {
    if (dateFrom || dateTo) {
      const d = new Date(o.order_date)
      if (dateFrom && d < dateFrom) return false
      if (dateTo && d > dateTo) return false
    }
    const matchSearch = !search ||
      o.purchase_order_id.toLowerCase().includes(search.toLowerCase()) ||
      o.customer_order_id?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || o.status === statusFilter
    return matchSearch && matchStatus
  })
  const filteredTotal = filtered.reduce((s, o) => s + (Number(o.total_amount) || 0), 0)
  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const displayedOrders = filtered.slice(tablePage * PAGE_SIZE, (tablePage + 1) * PAGE_SIZE)

  // Payment summary by concepto
  const paymentSummary = paymentLines.reduce<Record<string, number>>((acc, l) => {
    acc[l.concepto] = (acc[l.concepto] ?? 0) + l.amount
    return acc
  }, {})
  const netoPagado = Object.values(paymentSummary).reduce((s, v) => s + v, 0)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-[#1e2756]">Cuentas por Cobrar — Walmart</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {syncDone
            ? `Historial completo · última sync: ${fmtDate(lastSynced ?? '')}`
            : `Historial cargado hasta: ${fmtDate(syncedUntil)} · haz clic para continuar`
          }
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'orders' && (
            <button onClick={handleSyncOrders} disabled={isPending}
              className="bg-[#1e2756] hover:bg-[#16204a] disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
              {isPending ? 'Cargando...' : syncDone ? '↻ Actualizar recientes' : '↻ Cargar más historial'}
            </button>
          )}
          {tab === 'payments' && (
            <>
              <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileUpload} />
              <button onClick={() => fileInputRef.current?.click()} disabled={isPending}
                className="bg-[#1e2756] hover:bg-[#16204a] disabled:opacity-60 text-white text-sm font-medium px-4 py-2 rounded-lg transition">
                {isPending ? 'Importando...' : '↑ Cargar estado de cuenta (.csv)'}
              </button>
            </>
          )}
        </div>
      </div>

      {msg && (
        <div className={`text-sm rounded-lg px-4 py-3 ${msg.startsWith('Error') ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {msg}
        </div>
      )}

      {/* Async report status banner */}
      {tab === 'payments' && isAsyncPending && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="animate-spin text-yellow-500">⏳</span>
            <div>
              <p className="text-sm font-medium text-yellow-800">
                Generando reporte en Walmart... ({payReq.status})
              </p>
              <p className="text-xs text-yellow-600">
                Solicitado: {fmtDate(payReq.requested_at)} · {isPolling ? 'Verificando automáticamente cada 60s' : ''}
              </p>
            </div>
          </div>
          <button onClick={handleManualPoll} disabled={isPending}
            className="text-xs bg-yellow-100 hover:bg-yellow-200 text-yellow-800 px-3 py-1.5 rounded-md transition">
            Verificar ahora
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {(['orders', 'payments'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${tab === t ? 'border-[#1e2756] text-[#1e2756]' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
            {t === 'orders' ? `Órdenes (${orders.length})` : `Pagos (${paymentLines.length} líneas)`}
          </button>
        ))}
      </div>

      {/* ── ORDERS TAB ── */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Órdenes en período</p>
              <p className="text-2xl font-bold text-[#1e2756] mt-1">{filtered.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Monto total</p>
              <p className="text-xl font-bold text-[#1e2756] mt-1">{fmtMXN(filteredTotal)}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Entregadas</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{filtered.filter(o => o.status === 'Delivered').length}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <p className="text-xs text-gray-500">Canceladas</p>
              <p className="text-2xl font-bold text-red-500 mt-1">{filtered.filter(o => o.status === 'Cancelled').length}</p>
            </div>
          </div>

          {/* Date presets */}
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-xs text-gray-400">Período:</span>
            {DATE_PRESETS.map(([p, label]) => (
              <button key={p} onClick={() => setDatePreset(p)}
                className={`text-xs px-3 py-1.5 rounded-full border transition ${datePreset === p ? 'bg-[#1e2756] text-white border-[#1e2756]' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="flex gap-3 flex-wrap">
            <input type="text" placeholder="Buscar por # orden..."
              value={search} onChange={e => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2756] w-56" />
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2756]">
              <option value="">Todos los estados</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            {(search || statusFilter) && (
              <button onClick={() => { setSearch(''); setStatusFilter('') }}
                className="text-sm text-gray-500 hover:text-gray-700 underline">Limpiar</button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
              {orders.length === 0
                ? 'Sin órdenes. Haz clic en "Sincronizar Órdenes" para cargar datos.'
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
                  {displayedOrders.map(order => (
                    <Fragment key={order.purchase_order_id}>
                      <tr className="hover:bg-gray-50 cursor-pointer"
                        onClick={() => setExpanded(expanded === order.purchase_order_id ? null : order.purchase_order_id)}>
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
                            <div className="mt-2 text-xs text-gray-500">
                              <span className="font-medium text-gray-700">PO:</span> {order.purchase_order_id}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
              {pageCount > 1 && (
                <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50">
                  <p className="text-xs text-gray-500">
                    {tablePage * PAGE_SIZE + 1}–{Math.min((tablePage + 1) * PAGE_SIZE, filtered.length)} de {filtered.length} órdenes
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setTablePage(p => p - 1)} disabled={tablePage === 0}
                      className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-white transition">
                      ← Anterior
                    </button>
                    <span className="text-xs text-gray-400 px-2 py-1.5">Pág. {tablePage + 1} / {pageCount}</span>
                    <button onClick={() => setTablePage(p => p + 1)} disabled={tablePage >= pageCount - 1}
                      className="text-xs px-3 py-1.5 border border-gray-300 rounded-lg disabled:opacity-40 hover:bg-white transition">
                      Siguiente →
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── PAYMENTS TAB ── */}
      {tab === 'payments' && (
        <div className="space-y-4">
          {paymentLines.length === 0 && !isAsyncPending ? (
            <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-gray-400 text-sm">
              Sin datos de pagos. Descarga el estado de cuenta desde{' '}
            <a href="https://seller.walmart.com/payments/statements/period" target="_blank" rel="noopener noreferrer"
              className="underline text-blue-500">seller.walmart.com → Pagos → Estado de cuenta</a>
            {' '}y cárgalo con el botón &quot;Cargar estado de cuenta&quot;.
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500">Ventas brutas</p>
                  <p className="text-xl font-bold text-green-600 mt-1">
                    {fmtMXN(Math.abs(paymentSummary['Venta'] ?? 0))}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500">Comisiones</p>
                  <p className="text-xl font-bold text-orange-500 mt-1">
                    {fmtMXN(Math.abs(paymentSummary['Comision'] ?? 0))}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500">Retenciones (ISR+IVA)</p>
                  <p className="text-xl font-bold text-red-500 mt-1">
                    {fmtMXN(Math.abs((paymentSummary['Retencion ISR'] ?? 0) + (paymentSummary['Retencion IVA'] ?? 0)))}
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <p className="text-xs text-gray-500">Neto pagado por Walmart</p>
                  <p className="text-xl font-bold text-[#1e2756] mt-1">{fmtMXN(netoPagado)}</p>
                </div>
              </div>

              {/* Payments table */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Fecha pago</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500"># Pedido</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Concepto</th>
                      <th className="text-left px-4 py-3 font-medium text-gray-500">Tipo</th>
                      <th className="text-right px-4 py-3 font-medium text-gray-500">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paymentLines.map((l, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-2.5 text-gray-500 text-xs">{fmtDate(l.payment_date)}</td>
                        <td className="px-4 py-2.5 font-mono text-xs text-gray-600">{l.order_number || '—'}</td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${conceptoColor(l.concepto)}`}>
                            {l.concepto || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-gray-500">{l.ingreso_egreso}</td>
                        <td className={`px-4 py-2.5 text-right font-medium text-sm ${l.amount < 0 ? 'text-red-600' : 'text-green-700'}`}>
                          {fmtMXN(l.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

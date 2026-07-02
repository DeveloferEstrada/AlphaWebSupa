import { NextRequest, NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

const BUSART_URL = 'http://200.188.56.106:4080/Bus-Art'

function verifyBearer(authHeader: string | null): boolean {
  const secret = process.env.BIW_BEARER_TOKEN
  if (!secret) return false
  if (!authHeader?.startsWith('Bearer ')) return false
  return authHeader.slice(7) === secret
}

export async function GET(request: NextRequest) {
  if (!verifyBearer(request.headers.get('Authorization'))) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  let rawCSV: string
  try {
    const res = await fetch(BUSART_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Articulo: 'BASE.CSV' }),
      signal: AbortSignal.timeout(60_000),
    })
    if (!res.ok) {
      return NextResponse.json({ error: `Busart respondió ${res.status}` }, { status: 502 })
    }
    rawCSV = await res.text()
  } catch (err) {
    return NextResponse.json(
      { error: 'Error conectando con Alpha ERP.', detail: String(err) },
      { status: 502 }
    )
  }

  if (!rawCSV.trim()) {
    return NextResponse.json({ error: 'Respuesta vacía de Busart.' }, { status: 502 })
  }

  // Skip first metadata line ("Fecha Actualizacion: ..."), parse rest as pure CSV
  const csvBody = rawCSV.slice(rawCSV.indexOf('\n') + 1)

  const wb = XLSX.read(csvBody, { type: 'string', raw: false })
  const ws = wb.Sheets[wb.SheetNames[0]]

  // Set reasonable column widths
  const range = XLSX.utils.decode_range(ws['!ref'] ?? 'A1')
  ws['!cols'] = Array.from({ length: range.e.c + 1 }, (_, i) => ({
    wch: i < 5 ? 20 : i < 20 ? 30 : 18,
  }))

  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })

  const today = new Date().toISOString().split('T')[0]
  return new NextResponse(xlsxBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="BiW_Catalogo_${today}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  })
}

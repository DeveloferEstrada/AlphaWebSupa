import { NextRequest, NextResponse } from 'next/server'
import { importPaymentCSV } from '@/app/dashboard/cxc/actions'

const CRON_SECRET = process.env.CRON_SECRET

export async function POST(req: NextRequest) {
  // Verify shared secret — only GitHub Actions (or authorized callers) may hit this
  const auth = req.headers.get('Authorization')
  if (!CRON_SECRET || auth !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let csvContent: string
  let filename: string

  try {
    const body = await req.json()
    csvContent = body.csvContent
    filename   = body.filename ?? 'statement.csv'

    if (!csvContent || typeof csvContent !== 'string') {
      return NextResponse.json({ error: 'csvContent is required' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const result = await importPaymentCSV(csvContent, filename)
    return NextResponse.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[import-payments cron]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body?.RefreshToken) {
    return NextResponse.json({ error: 'RefreshToken es requerido.' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data, error } = await supabase.auth.refreshSession({
    refresh_token: String(body.RefreshToken),
  })

  if (error || !data.session) {
    return NextResponse.json({ error: 'Refresh inválido o expirado.' }, { status: 401 })
  }

  const session = data.session

  return NextResponse.json({
    token_type: 'Bearer',
    access_token: session.access_token,
    expires_in: session.expires_in ?? 1800,
    refresh_token: session.refresh_token,
  })
}

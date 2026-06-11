import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body?.Username || !body?.Password) {
    return NextResponse.json({ error: 'Username y Password son requeridos.' }, { status: 400 })
  }

  const username = String(body.Username).trim()
  const password = String(body.Password)

  // Mapeo: username → email interno para Supabase Auth
  const email = `${username.toLowerCase()}@suppliers.mega-audio.com.mx`

  const supabase = createAdminClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error || !data.session) {
    return NextResponse.json({ error: 'Credenciales inválidas.' }, { status: 401 })
  }

  const session = data.session

  // Respuesta idéntica al formato original del AuthController
  return NextResponse.json({
    token_type: 'Bearer',
    access_token: session.access_token,
    expires_in: session.expires_in ?? 1800,
    refresh_token: session.refresh_token,
  })
}

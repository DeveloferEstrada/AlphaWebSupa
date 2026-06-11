import { verifyBearerToken } from '@/lib/api-auth'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const auth = await verifyBearerToken(request.headers.get('Authorization'))
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('full_name, user_type, role, provider_code')
    .eq('id', auth.user.id)
    .single()

  return NextResponse.json({
    sub: auth.user.id,
    unique_name: profile?.provider_code ?? auth.user.email,
    email: auth.user.email,
    user_type: profile?.user_type,
    role: profile?.role,
    provider_code: profile?.provider_code,
  })
}

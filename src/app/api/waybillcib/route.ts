import { verifyBearerToken } from '@/lib/api-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse, type NextRequest } from 'next/server'
import nodemailer from 'nodemailer'

const CIB_URL = 'http://200.188.56.106:4080/Gui-Cib'

function normalizarBase64(input: string): string {
  const s = input.trim()
  const idx = s.toLowerCase().indexOf('base64,')
  if (idx >= 0) return s.slice(idx + 7).trim()
  if (s.toLowerCase().startsWith('base64(') && s.endsWith(')')) return s.slice(7, -1).trim()
  return s
}

function sanitizeSegment(s: string): string {
  return s.replace(/[^a-zA-Z0-9\-_]/g, '') || 'Proveedor'
}

function sanitizeFileName(s: string): string {
  return s.replace(/[/\\?%*:|"<>]/g, '_') || 'archivo'
}

async function enviarCorreo(
  pdfBuffer: Buffer,
  fileName: string,
  orderNumber: string,
  proveedor: string,
  carrier: string,
  waybills: string,
  relativePath: string
) {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  })

  const cc = (process.env.WAYBILL_EMAIL_CC ?? '').split(',').filter(Boolean)

  await transporter.sendMail({
    from: `"${process.env.SMTP_FROM_NAME}" <${process.env.SMTP_USER}>`,
    to: process.env.WAYBILL_EMAIL_TO,
    cc,
    subject: `Waybill CIB - Orden ${orderNumber}`,
    html: `
      <p>Se recibió Waybill para la orden <b>${orderNumber}</b>.</p>
      <p><b>Proveedor:</b> ${proveedor}</p>
      <p><b>Carrier:</b> ${carrier}</p>
      <p><b>Waybills:</b> ${waybills}</p>
      <p><b>Archivo:</b> ${relativePath}</p>`,
    attachments: [{ filename: fileName, content: pdfBuffer, contentType: 'application/pdf' }],
  })
}

export async function POST(request: NextRequest) {
  const auth = await verifyBearerToken(request.headers.get('Authorization'))
  if (!auth) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 401 })
  }

  const { data: profile } = await auth.supabase
    .from('profiles')
    .select('provider_code')
    .eq('id', auth.user.id)
    .single()

  const proveedor = profile?.provider_code
  if (!proveedor) {
    return NextResponse.json(
      { error: 'Token inválido: no se encontró proveedor (unique_name).' },
      { status: 401 }
    )
  }

  const body = await request.json().catch(() => null)
  const orderNumber = String(body?.order_number ?? '').trim()
  const carrier = String(body?.carrier ?? '').trim()
  const waybills = String(body?.waybills ?? '').trim()
  const fileRaw = String(body?.file ?? '').trim()

  if (!orderNumber) return NextResponse.json({ error: 'order_number es requerido.' }, { status: 400 })
  if (!fileRaw) return NextResponse.json({ error: 'file (base64) es requerido.' }, { status: 400 })

  // 1) Decodificar base64
  const fileBase64 = normalizarBase64(fileRaw)
  let pdfBuffer: Buffer
  try {
    pdfBuffer = Buffer.from(fileBase64, 'base64')
  } catch {
    return NextResponse.json({ error: "El campo 'file' no es un base64 válido." }, { status: 400 })
  }

  // 2) Guardar PDF en Supabase Storage: waybills/{proveedor}/{order_number}.pdf
  const folderName = sanitizeSegment(proveedor)
  const fileName = sanitizeFileName(orderNumber) + '.pdf'
  const storagePath = `${folderName}/${fileName}`
  const relativePath = `/storage/waybills/${storagePath}`

  const supabaseAdmin = createAdminClient()
  const { error: uploadError } = await supabaseAdmin.storage
    .from('waybills')
    .upload(storagePath, pdfBuffer, {
      contentType: 'application/pdf',
      upsert: true,
    })

  if (uploadError) {
    return NextResponse.json(
      { error: 'Error guardando PDF.', detail: uploadError.message },
      { status: 500 }
    )
  }

  // 3) Reenviar a Gui-Cib
  const jsonPayload = JSON.stringify(
    { order_number: orderNumber, waybills, carrier, file: fileBase64 },
    null,
    2
  )

  let responseText: string
  let statusCode: number

  try {
    const response = await fetch(CIB_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: jsonPayload,
      signal: AbortSignal.timeout(30_000),
    })
    statusCode = response.status
    responseText = await response.text()

    if (!response.ok) {
      return NextResponse.json(
        { error: 'Error enviando a Gui-Cib.', status: statusCode, detail: responseText },
        { status: statusCode }
      )
    }
  } catch (ex: unknown) {
    return NextResponse.json({ error: 'Error llamando Gui-Cib.', detail: String(ex) }, { status: 502 })
  }

  // 4) Verificar result == 1
  let result = 0
  try {
    result = JSON.parse(responseText)?.result ?? 0
  } catch {
    return NextResponse.json(
      { error: 'Respuesta inválida de Gui-Cib.', detail: responseText },
      { status: 502 }
    )
  }

  if (result !== 1) {
    return NextResponse.json(
      { error: 'Gui-Cib devolvió result=0 (no recibido correctamente).', response: responseText },
      { status: 502 }
    )
  }

  // 5) Enviar correo
  try {
    await enviarCorreo(pdfBuffer, fileName, orderNumber, proveedor, carrier, waybills, relativePath)
  } catch (ex: unknown) {
    return NextResponse.json(
      {
        error: 'Se recibió OK de Gui-Cib pero falló el envío de correo.',
        detail: String(ex),
        archivo: relativePath,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({ result: 1 })
}

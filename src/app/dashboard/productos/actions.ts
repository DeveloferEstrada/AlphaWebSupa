'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import * as XLSX from 'xlsx'
import { revalidatePath } from 'next/cache'

export async function uploadProductFile(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('No autorizado.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, user_type, is_active')
    .eq('id', user.id)
    .single()

  if (
    !profile?.is_active ||
    profile.user_type !== 'internal' ||
    !['admin', 'operations', 'ventas'].includes(profile.role ?? '')
  ) {
    throw new Error('No tienes permiso para subir archivos.')
  }

  const version = formData.get('version') as string
  if (version !== 'v1' && version !== 'v2') throw new Error('Versión inválida.')

  const file = formData.get('file') as File
  if (!file || file.size === 0) throw new Error('Selecciona un archivo.')
  if (!file.name.toLowerCase().endsWith('.xlsx')) throw new Error('Solo se aceptan archivos .xlsx')

  const fileBuffer0 = Buffer.from(await file.arrayBuffer())
  const wb = XLSX.read(fileBuffer0, { type: 'buffer', sheetRows: 1 })
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 })
  const headers = (rows[0] ?? []).map((h: unknown) => String(h ?? '').trim().toUpperCase())

  if (version === 'v1') {
    if (headers.includes('GUIA')) {
      throw new Error('Este archivo parece ser V2, súbelo en el apartado correcto.')
    }
  }

  if (version === 'v2') {
    if (!headers.includes('NO DE PARTE')) {
      throw new Error('El archivo no contiene la columna "NO DE PARTE". ¿Es el archivo V2 correcto?')
    }
    if (!headers.includes('GUIA')) {
      throw new Error('El archivo no contiene la columna "GUIA". ¿Es el archivo V2 correcto?')
    }
  }

  const today = new Date().toISOString().split('T')[0]
  const storagePath = `cyberpuerta/${version}/${today}.xlsx`

  const adminClient = createAdminClient()

  const { error: uploadError } = await adminClient.storage
    .from('productos')
    .upload(storagePath, fileBuffer0, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    })

  if (uploadError) throw new Error(`Error al guardar archivo: ${uploadError.message}`)

  const { error: dbError } = await adminClient
    .from('product_file_uploads')
    .upsert(
      {
        provider_code: 'CyberPuerta',
        version,
        file_date: today,
        storage_path: storagePath,
        original_filename: file.name,
        uploaded_by: user.id,
      },
      { onConflict: 'provider_code,version,file_date' }
    )

  if (dbError) throw new Error(`Error al registrar carga: ${dbError.message}`)

  revalidatePath('/dashboard/productos')
}

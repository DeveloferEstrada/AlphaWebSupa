'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { uploadProductFile } from './actions'

interface UploadStatus {
  uploaded: boolean
  time?: string
  lastAvailable?: string
}

function UploadCard({
  version,
  title,
  subtitle,
  status,
}: {
  version: 'v1' | 'v2'
  title: string
  subtitle: string
  status: UploadStatus
}) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Selecciona un archivo.'); return }

    setError(null)
    setSuccess(false)

    const fd = new FormData()
    fd.append('version', version)
    fd.append('file', file)

    startTransition(async () => {
      try {
        await uploadProductFile(fd)
        setSuccess(true)
        if (fileRef.current) fileRef.current.value = ''
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error al subir archivo.')
      }
    })
  }

  return (
    <div className={`bg-white rounded-xl border-2 p-5 ${status.uploaded ? 'border-green-200' : 'border-yellow-200'}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-[#1e2756]">{title}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap ${
          status.uploaded ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
        }`}>
          {status.uploaded ? '✓ Subido hoy' : '✗ No subido hoy'}
        </span>
      </div>

      {status.uploaded && status.time && (
        <p className="text-xs text-gray-400 mb-4">Subido a las {status.time}</p>
      )}
      {!status.uploaded && status.lastAvailable && (
        <p className="text-xs text-yellow-600 mb-4">Última disponible: {status.lastAvailable}</p>
      )}
      {!status.uploaded && !status.lastAvailable && (
        <p className="text-xs text-gray-400 mb-4">Sin archivos previos.</p>
      )}

      <form onSubmit={handleUpload} className="space-y-2">
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="block w-full text-xs text-gray-500
            file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0
            file:text-xs file:font-medium file:bg-[#1e2756] file:text-white
            hover:file:bg-[#16204a] file:cursor-pointer file:transition"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        {success && <p className="text-xs text-green-600">Archivo subido correctamente.</p>}
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-[#1e2756] hover:bg-[#16204a] disabled:opacity-60 text-white text-sm font-medium py-2 rounded-lg transition"
        >
          {isPending ? 'Subiendo...' : `Subir ${version.toUpperCase()}`}
        </button>
      </form>
    </div>
  )
}

export default function ProductUploadCards({
  v1,
  v2,
}: {
  v1: UploadStatus
  v2: UploadStatus
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <UploadCard
        version="v1"
        title="Archivo Base (ERP)"
        subtitle="Export natural del ERP, sin precios de envío"
        status={v1}
      />
      <UploadCard
        version="v2"
        title="Archivo Actualizado"
        subtitle='Requiere columnas "NO DE PARTE" y "GUIA"'
        status={v2}
      />
    </div>
  )
}

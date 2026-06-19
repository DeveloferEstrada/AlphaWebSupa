'use client'

import { useRef, useState, useTransition } from 'react'
import Image from 'next/image'
import { createUser, updateUser } from '@/app/dashboard/users/actions'
import type { Profile, UserRole, UserType } from '@/types/database'

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'admin', label: 'Administrador' },
  { value: 'finance', label: 'Finanzas' },
  { value: 'operations', label: 'Operaciones' },
  { value: 'systems', label: 'Sistemas' },
  { value: 'ventas', label: 'Ventas' },
]

interface Props {
  user?: Profile
  onClose: () => void
}

export default function UserModal({ user, onClose }: Props) {
  const isEdit = !!user
  const formRef = useRef<HTMLFormElement>(null)
  const [userType, setUserType] = useState<UserType>(user?.user_type ?? 'internal')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(formRef.current!)

    startTransition(async () => {
      try {
        if (isEdit) await updateUser(user.id, fd)
        else await createUser(fd)
        onClose()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error inesperado')
      }
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-[#1e2756]">
            {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre completo</label>
            <input name="full_name" defaultValue={user?.full_name ?? ''} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2756]" />
          </div>

          {!isEdit && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Correo electrónico</label>
                <input name="email" type="email" required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2756]" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Contraseña temporal</label>
                <input name="password" type="password" required minLength={8}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2756]" />
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de usuario</label>
            <select name="user_type" value={userType} onChange={e => setUserType(e.target.value as UserType)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2756]">
              <option value="internal">Usuario interno</option>
              <option value="supplier">Proveedor</option>
            </select>
          </div>

          {userType === 'internal' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Rol</label>
              <select name="role" defaultValue={user?.role ?? 'operations'}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2756]">
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          )}

          {isEdit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
              <select name="is_active" defaultValue={String(user?.is_active ?? true)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1e2756]">
                <option value="true">Activo</option>
                <option value="false">Inactivo</option>
              </select>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-600">{error}</div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={isPending}
              className="flex-1 flex items-center justify-center gap-2 bg-[#1e2756] hover:bg-[#16204a] disabled:opacity-60 text-white rounded-lg px-4 py-2 text-sm font-medium transition">
              {isPending ? (
                <><Image src="/brand/loader.gif" alt="" width={16} height={16} unoptimized /> Guardando...</>
              ) : (isEdit ? 'Guardar cambios' : 'Crear usuario')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

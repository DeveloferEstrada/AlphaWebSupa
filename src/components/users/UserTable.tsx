'use client'

import { useState } from 'react'
import { toggleUserActive } from '@/app/dashboard/users/actions'
import UserModal from './UserModal'
import type { Profile } from '@/types/database'

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  finance: 'Finanzas',
  operations: 'Operaciones',
  systems: 'Sistemas',
}

export default function UserTable({ users }: { users: Profile[] }) {
  const [editing, setEditing] = useState<Profile | null>(null)
  const [creating, setCreating] = useState(false)

  async function handleToggle(id: string, current: boolean) {
    await toggleUserActive(id, !current)
  }

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-[#1e2756]">Usuarios</h1>
          <p className="text-sm text-gray-500 mt-0.5">{users.length} usuarios registrados</p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="bg-[#1e2756] hover:bg-[#16204a] text-white text-sm font-medium px-4 py-2 rounded-lg transition"
        >
          + Nuevo usuario
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="text-left px-5 py-3 font-medium text-gray-600">Nombre</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Correo</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Tipo</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Rol</th>
              <th className="text-left px-5 py-3 font-medium text-gray-600">Estado</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(u => (
              <tr key={u.id} className="hover:bg-gray-50 transition">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-[#1e2756]/10 flex items-center justify-center text-[#1e2756] font-semibold text-xs">
                      {(u.full_name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-gray-800">{u.full_name || '—'}</span>
                  </div>
                </td>
                <td className="px-5 py-3.5 text-gray-600">{u.email}</td>
                <td className="px-5 py-3.5">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                    u.user_type === 'internal'
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-purple-50 text-purple-700'
                  }`}>
                    {u.user_type === 'internal' ? 'Interno' : 'Proveedor'}
                  </span>
                </td>
                <td className="px-5 py-3.5 text-gray-600">
                  {u.role ? roleLabels[u.role] : '—'}
                </td>
                <td className="px-5 py-3.5">
                  <button
                    onClick={() => handleToggle(u.id, u.is_active)}
                    className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium transition ${
                      u.is_active
                        ? 'bg-green-50 text-green-700 hover:bg-green-100'
                        : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                    }`}
                  >
                    {u.is_active ? 'Activo' : 'Inactivo'}
                  </button>
                </td>
                <td className="px-5 py-3.5 text-right">
                  <button
                    onClick={() => setEditing(u)}
                    className="text-gray-400 hover:text-[#1e2756] transition text-xs font-medium"
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="text-center py-12 text-gray-400 text-sm">
            No hay usuarios registrados.
          </div>
        )}
      </div>

      {creating && <UserModal onClose={() => setCreating(false)} />}
      {editing && <UserModal user={editing} onClose={() => setEditing(null)} />}
    </>
  )
}

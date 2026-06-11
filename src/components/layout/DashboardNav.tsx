'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const links = [
  { href: '/dashboard', label: 'Inicio' },
  { href: '/dashboard/users', label: 'Usuarios' },
]

export default function DashboardNav() {
  const pathname = usePathname()

  return (
    <div className="bg-white border-b border-gray-200 px-6">
      <nav className="flex gap-1">
        {links.map(({ href, label }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition ${
                active
                  ? 'border-[#1e2756] text-[#1e2756]'
                  : 'border-transparent text-gray-500 hover:text-gray-800'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </nav>
    </div>
  )
}

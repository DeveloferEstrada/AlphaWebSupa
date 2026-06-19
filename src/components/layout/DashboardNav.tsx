'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface NavLink {
  href: string
  label: string
  roles?: string[]
}

const ALL_LINKS: NavLink[] = [
  { href: '/dashboard', label: 'Inicio' },
  { href: '/dashboard/users', label: 'Usuarios', roles: ['admin'] },
  { href: '/dashboard/productos', label: 'Productos', roles: ['admin', 'operations', 'ventas'] },
  { href: '/dashboard/cxc', label: 'CxC', roles: ['admin', 'finance', 'cxc'] },
]

interface Props {
  role?: string | null
  userType?: string | null
}

export default function DashboardNav({ role, userType }: Props) {
  const pathname = usePathname()

  const links = ALL_LINKS.filter(
    link => !link.roles || (userType === 'internal' && link.roles.includes(role ?? ''))
  )

  return (
    <div className="bg-white border-b border-gray-200 px-6">
      <nav className="flex gap-1">
        {links.map(({ href, label }) => {
          const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href))
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

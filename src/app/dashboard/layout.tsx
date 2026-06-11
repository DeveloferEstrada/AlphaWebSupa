import { redirect } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/server'
import DashboardNav from '@/components/layout/DashboardNav'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-[#1e2756] px-6 py-3 flex items-center justify-between shadow-md">
        <Image
          src="/brand/Logo-Mega-Audio.png"
          alt="Mega Audio"
          width={160}
          height={40}
          className="brightness-0 invert"
          priority
        />
        <form action="/auth/signout" method="post">
          <button
            type="submit"
            className="text-sm text-white/70 hover:text-white transition"
          >
            Cerrar sesión
          </button>
        </form>
      </nav>
      <DashboardNav />
      <main className="p-6 max-w-6xl mx-auto">{children}</main>
    </div>
  )
}

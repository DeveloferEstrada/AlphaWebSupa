# Alpha Web ERP — Contexto para Claude

## Proyecto
ERP web modular para reemplazar Alpha Micro System. Empresa: Mega Audio.
Repo: https://github.com/DeveloferEstrada/AlphaWebSupa.git

## Stack
- **Frontend**: Next.js 16 (App Router) + TypeScript + Tailwind CSS
- **Auth + DB**: Supabase (PostgreSQL + Supabase Auth)
- **Deploy**: Vercel (auto-deploy desde `main`)

## Usuarios
- `internal`: empleados de la empresa con roles (`admin`, `finance`, `operations`, `systems`)
- `supplier`: proveedores externos (acceso futuro a portal de proveedores y API)

## Estructura
```
src/
  app/
    (auth)/login/        ← página de login
    (dashboard)/         ← rutas protegidas post-login
    auth/signout/        ← route handler para cerrar sesión
  lib/supabase/
    client.ts            ← cliente para el browser
    server.ts            ← cliente para Server Components y Route Handlers
  middleware.ts          ← protección de rutas
  types/database.ts      ← tipos TypeScript del esquema
```

## Variables de entorno
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```
Nunca subir `.env.local` a git (está en .gitignore).

## Convenciones
- Componentes de servidor por defecto. `'use client'` solo cuando se necesita interactividad.
- RLS habilitado en todas las tablas de Supabase.
- Nuevos módulos se agregan como rutas bajo `(dashboard)/`.
- Un feature = un branch (`feature/nombre-modulo`), PR a `main`.

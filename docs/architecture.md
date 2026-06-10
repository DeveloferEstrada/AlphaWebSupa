# Arquitectura — Alpha Web ERP

## Diagrama de flujo

```
Usuario → Vercel (Next.js)
              │
              ├── /login           → Supabase Auth
              ├── /dashboard       → Server Components + Supabase DB
              └── /api/*           → Route Handlers (futuro: .NET Core)
```

## Decisiones técnicas

| Decisión | Elección | Razón |
|---|---|---|
| Framework | Next.js App Router | SSR, rutas protegidas server-side, escalable |
| Auth | Supabase Auth | JWT nativo, sin código extra, integrado con PostgreSQL |
| Roles | Tabla `profiles` + RLS | Flexible, seguro, CRUD desde admin panel futuro |
| Deploy | Vercel | CI/CD automático desde GitHub, sin configuración |

## Base de datos

### `profiles` (schema: public)
Extiende `auth.users` de Supabase.

| Campo | Tipo | Descripción |
|---|---|---|
| id | uuid | FK a auth.users(id) |
| email | text | Correo del usuario |
| full_name | text | Nombre completo |
| user_type | text | `internal` o `supplier` |
| role | text | `admin`, `finance`, `operations`, `systems` (null para suppliers) |
| is_active | boolean | Habilitar/deshabilitar acceso |
| created_at | timestamptz | — |
| updated_at | timestamptz | Auto-actualizado por trigger |

### RLS Policies activas
- Usuarios leen su propio perfil
- Usuarios actualizan su propio perfil
- (Futuro) Admins leen todos los perfiles

## Roadmap de módulos
1. ✅ Auth + Login
2. ⬜ Gestión de usuarios (CRUD, roles)
3. ⬜ Portal de proveedores
4. ⬜ API .NET Core (capa de negocio)
5. ⬜ Módulos ERP (finanzas, operaciones, inventario...)

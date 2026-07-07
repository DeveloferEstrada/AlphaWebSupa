# Alpha Web ERP — Contexto para Claude

## Empresa y Proyecto
ERP web modular para **Mega Audio** — reemplaza Alpha Micro System (ERP legacy).
Repo: https://github.com/DeveloferEstrada/AlphaWebSupa.git
Deploy: https://alpha-web-supa.vercel.app

## Stack
- **Frontend**: Next.js (App Router) + TypeScript + Tailwind CSS
- **Auth + DB**: Supabase (PostgreSQL + Supabase Auth)
- **Deploy**: Vercel Pro — auto-deploy desde `main`, preview por branch

---

## Arquitectura de Base de Datos (Supabase Schemas)

Un solo proyecto Supabase (`Alpha Web Supa`) con schemas separados por dominio:

| Schema | Propósito |
|--------|-----------|
| `public` | Auth, profiles, configuración compartida |
| `erp` | Espejo de Alpha Micro (inventario, productos, proveedores) |
| `walmart` | Órdenes, pagos, sync Walmart MX Marketplace |
| `mercadolibre` | (en desarrollo) Marketplace Mercado Libre |
| `biw` | Catálogo Bi World Wide (clientes externos) |
| `kpis` | Vistas materializadas que cruzan todos los marketplaces |

**Regla**: cada marketplace tiene su propio schema. Los KPIs hacen JOINs nativos entre schemas.

---

## Módulos Existentes

### CXC — Cuentas por Cobrar Marketplaces
- Ruta: `/dashboard/cxc`
- Sincroniza órdenes de Walmart vía API oficial
- Importa pagos via CSV (subida manual o descarga automática)
- Muestra desglose dinámico por concepto (ventas, comisiones, WFS, retenciones)
- Tablas: `walmart_orders`, `walmart_order_lines`, `walmart_payments`, `walmart_payment_requests`, `walmart_sync_state`

### API Catálogo Bi World Wide
- Endpoint: `GET /api/biw/catalogo`
- Auth: Bearer token (`BIW_BEARER_TOKEN` env var)
- Llama a Alpha ERP (Busart) → recibe CSV → convierte a XLSX → responde al cliente
- Mock disponible con `BUSART_MOCK=true` (para pruebas sin Busart)
- Busart URL: `http://200.188.56.106:4080/Bus-Art` con body `{"Articulo":"BASE.CSV"}`

### APIs Internas Alpha ERP
- **Art-Cib**: `http://200.188.56.106:4080/Art-Cib` — catálogo por proveedor
- **Busart**: `http://200.188.56.106:4080/Bus-Art` — catálogo BASE completo
- Autenticación con Bearer token de Supabase (usuarios internos)

---

## Usuarios y Roles

### Tipo `internal` (empleados Mega Audio)
| Rol | Acceso |
|-----|--------|
| `admin` | Todo |
| `finance` | CXC, pagos |
| `cxc` | CXC, marketplaces |
| `operations` | Operaciones |
| `systems` | Sistemas/IT |

### Tipo `supplier` (proveedores externos)
- Acceso a portal de proveedores (en desarrollo)
- Autenticados con Supabase Auth
- `provider_code` en profiles para identificar proveedor

### Tipo externo (clientes API como Bi World Wide)
- No tienen cuenta en Supabase
- Autenticados con Bearer token estático en env var

---

## Flujo Git (equipo)

```
main              → producción (Vercel prod deploy)
feat/walmart-*    → módulos Walmart / CXC
feat/mercadolibre-* → módulos Mercado Libre
feat/biw-*        → módulos Bi World Wide
feat/kpis-*       → dashboards KPI integrados
feat/erp-*        → migración/espejo Alpha Micro
```

- Un feature = un branch → PR a `main`
- Vercel genera URL de preview por branch automáticamente
- Cada colaborador trabaja en su área sin pisar al otro

---

## Variables de Entorno Clave

```
# Supabase
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY

# SMTP (notificaciones waybill)
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS / SMTP_FROM_NAME
WAYBILL_EMAIL_TO / WAYBILL_EMAIL_CC

# Walmart MX API
WALMART_BASE_URL=https://marketplace.walmartapis.com
WALMART_MARKET=mx
WALMART_CLIENT_ID
WALMART_CLIENT_SECRET

# Bi World Wide
BIW_BEARER_TOKEN        ← token que BiW envía en Authorization header
BUSART_MOCK=true/false  ← true = datos de prueba sin llamar a Busart
```

Nunca subir `.env.local` a git (en .gitignore).

---

## Convenciones de Código

- Componentes de servidor por defecto. `'use client'` solo cuando se necesita interactividad.
- RLS habilitado en todas las tablas de Supabase.
- `createAdminClient()` solo en Server Actions y Route Handlers — nunca en cliente.
- Nuevos módulos: rutas bajo `src/app/dashboard/` (UI) o `src/app/api/` (endpoints externos).
- Inserts masivos en chunks de 500 filas (límite Supabase PostgREST).
- Paginación con `.range(from, from + PAGE_SIZE - 1)` para tablas > 1000 filas.
- Sin comentarios obvios. Solo comentar el POR QUÉ si no es evidente.

---

## Estructura del Proyecto

```
src/
  app/
    (auth)/login/             ← página de login
    dashboard/
      cxc/                    ← Cuentas x Cobrar (Walmart)
        page.tsx              ← Server Component (fetch data)
        CxcDashboard.tsx      ← Client Component (UI interactiva)
        actions.ts            ← Server Actions (sync, import)
    api/
      biw/catalogo/           ← API externa Bi World Wide
      import-payments/        ← Upload CSV pagos Walmart
      full-catalog/           ← Catálogo Art-Cib
      waybillcib/             ← Guías de envío
  lib/
    supabase/
      client.ts               ← cliente browser
      server.ts               ← cliente Server Components
      admin.ts                ← cliente service role (sin RLS)
    walmart.ts                ← fetch API Walmart + parseadores CSV
    api-auth.ts               ← verifyBearerToken (usuarios Supabase)
  types/
    database.ts               ← tipos TypeScript del schema
```

---

## Contexto de Negocio

- **Mega Audio** distribuye productos de electrónica/audio en México
- Vende en marketplaces: Walmart MX, Mercado Libre (próximo), otros
- Alpha Micro System es el ERP legacy (en uso activo). La migración a Supabase es un proyecto a mediano plazo.
- Israel Martínez actualiza el archivo BASE en Alpha ERP — Busart devuelve el catálogo actualizado
- Bi World Wide es cliente externo que consume el catálogo vía API

---

## Decisiones de Arquitectura Tomadas

1. **Un solo Supabase** con schemas separados (no proyectos múltiples) para permitir JOINs nativos en KPIs
2. **Bearer token estático** (env var) para clientes externos como BiW — no usuarios Supabase
3. **CSV upload** como fallback cuando la API de Walmart no expone ciertos reportes
4. **Paginación obligatoria** en todas las queries a tablas que pueden superar 1000 filas
5. **Mock con env var** (`BUSART_MOCK`) para desarrollar sin dependencia del ERP legacy

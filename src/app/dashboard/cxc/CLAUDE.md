# CXC — Cuentas por Cobrar Marketplaces

## Responsable
Módulo de finanzas/tesorería. Roles con acceso: `admin`, `finance`, `cxc`.

## Qué hace este módulo
Centraliza los cobros de todos los marketplaces: muestra órdenes, pagos recibidos,
desglose por concepto (ventas, comisiones, WFS, retenciones ISR/IVA, etc.) y permite
importar estados de cuenta en CSV.

## Tablas Supabase (schema `walmart`)
| Tabla | Descripción |
|-------|-------------|
| `walmart_orders` | Órdenes sincronizadas vía API Walmart. PK: `purchase_order_id` |
| `walmart_order_lines` | Líneas de cada orden (SKU, cantidad, precio) |
| `walmart_payments` | Líneas de pago del estado de cuenta CSV. FK: `request_id` |
| `walmart_payment_requests` | Registro de cada importación (status, filas, fecha) |
| `walmart_sync_state` | Cursor de sincronización (id=1, `orders_synced_until`) |

## Flujo de datos
1. **Órdenes**: `syncWalmartOrders()` en `actions.ts` — llama API Walmart por ventanas semanales
2. **Pagos**: usuario sube CSV desde seller.walmart.com → `importPaymentCSV()` parsea y guarda
3. **UI**: `page.tsx` carga todo server-side con paginación (chunks de 1000) → pasa props a `CxcDashboard.tsx`

## Archivos clave
```
page.tsx          ← Server Component. Fetch paginado de órdenes y pagos. NO modificar lógica de auth.
CxcDashboard.tsx  ← Client Component. UI, filtros, desglose por concepto.
actions.ts        ← Server Actions: syncWalmartOrders, requestWalmartPayments, importPaymentCSV
```

## Reglas de negocio importantes
- Walmart MX corta pagos los **miércoles**, publica estados los **jueves**
- El CSV de pagos tiene una primera línea de metadata — se omite al parsear
- La columna `concepto` viene del campo `Concept` del CSV de Walmart
- Los pagos WFS (Walmart Fulfillment Services) son: "WFS - Tarifa de envio", "WFS - Tarifa de manejo", "WFS - Tarifa de almacenaje"
- Inserts en chunks de 500 — el CSV puede tener 5000+ filas

## Al agregar un nuevo marketplace a este módulo
1. Crear sus tablas bajo el schema correspondiente (ej. `mercadolibre`)
2. Agregar una sección en `CxcDashboard.tsx` con el mismo patrón de desglose por concepto
3. El `page.tsx` carga los datos de todos los marketplaces y los pasa como props

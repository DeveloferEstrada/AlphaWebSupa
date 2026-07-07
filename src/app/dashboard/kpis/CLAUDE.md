# KPIs — Dashboard Integrado

## Responsable
Capa de inteligencia de negocio. Agrega datos de todos los marketplaces y del ERP
para dar una visión unificada del negocio a dirección y finanzas.

## Objetivo
Responder preguntas como:
- ¿Cuánto vendimos en total (Walmart + ML + otros) este mes?
- ¿Cuál es el margen neto por marketplace después de comisiones y retenciones?
- ¿Qué SKUs tienen mejor rotación en cada canal?
- ¿Cuánto debemos cobrar vs cuánto ya recibimos?

## Ventaja de la arquitectura unificada
Al estar todos los datos en un solo Supabase, los KPIs hacen JOINs nativos entre schemas:

```sql
-- Ejemplo: ventas totales por marketplace este mes
SELECT 'walmart' as marketplace, SUM(total_amount) as ventas
FROM walmart.walmart_orders
WHERE order_date >= date_trunc('month', now())

UNION ALL

SELECT 'mercadolibre', SUM(total_amount)
FROM mercadolibre.ml_orders
WHERE order_date >= date_trunc('month', now())
```

## Herramientas sugeridas

### Vistas materializadas (Supabase)
Para KPIs pesados que no necesitan tiempo real — se refrescan con un cron:
```sql
CREATE MATERIALIZED VIEW kpis.ventas_mensuales AS ...
REFRESH MATERIALIZED VIEW kpis.ventas_mensuales;
```

### Cron de refresco
Usar `/api/cron/refresh-kpis` protegido con `CRON_SECRET` (patrón ya usado en el proyecto).

## Tablas/Vistas a crear (schema `kpis`)
| Vista | Descripción |
|-------|-------------|
| `ventas_por_marketplace` | Ventas brutas por canal y periodo |
| `pagos_por_concepto` | Breakdown de comisiones/retenciones por canal |
| `margen_neto` | Ingreso - comisiones - retenciones - costos de envío |
| `top_skus` | SKUs más vendidos por canal |
| `cxc_pendiente` | Órdenes facturadas sin pago registrado |

## Archivos a crear
```
page.tsx          ← Server Component (carga vistas materializadas)
KpisDashboard.tsx ← Client Component con gráficas (Recharts o similar)
```

## Acceso
- Roles con acceso: `admin`, `finance`
- Los KPIs son de solo lectura — nunca mutaciones desde este módulo

## Estado actual
🔲 Sin iniciar — requiere que los módulos de Walmart y ML estén estables primero

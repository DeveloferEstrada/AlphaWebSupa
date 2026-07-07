# Mercado Libre — Marketplace

## Responsable
Módulo en desarrollo. Integración con Mercado Libre México como canal de ventas.

## Objetivo
Replicar el mismo flujo que el módulo CXC de Walmart pero para Mercado Libre:
- Sincronizar órdenes vía API ML
- Importar estados de cuenta / pagos
- Mostrar desglose por concepto en el dashboard CXC

## API de Mercado Libre
- Documentación: https://developers.mercadolibre.com.mx
- Autenticación: OAuth 2.0 (access_token + refresh_token)
- Base URL MX: `https://api.mercadolibre.com`
- App ID y Secret van en env vars: `ML_APP_ID`, `ML_APP_SECRET`, `ML_ACCESS_TOKEN`, `ML_REFRESH_TOKEN`

## Tablas a crear (schema `mercadolibre`)
Seguir el mismo patrón que `walmart`:

| Tabla | Equivalente Walmart |
|-------|---------------------|
| `ml_orders` | `walmart_orders` |
| `ml_order_items` | `walmart_order_lines` |
| `ml_payments` | `walmart_payments` |
| `ml_payment_requests` | `walmart_payment_requests` |
| `ml_sync_state` | `walmart_sync_state` |

## Archivos a crear
```
page.tsx          ← Server Component (mismo patrón que cxc/page.tsx)
MlDashboard.tsx   ← Client Component
actions.ts        ← syncMlOrders, importMlPayments
```

## Conceptos de pago ML (equivalentes a Walmart)
- Venta: ingreso por venta
- Comisión ML: fee del marketplace (~13-15%)
- Envío: costo de fulfillment (MELI Full o normal)
- Retención IVA / ISR: retenciones fiscales
- Reembolso / Devolución: cargos por devoluciones

## Notas de integración
- ML usa paginación por `offset` + `limit` (no cursor como Walmart)
- Los pagos están en `/collections/search` o en el reporte de liquidaciones
- Los tokens de ML expiran cada 6 horas — implementar refresh automático
- Considerar webhook de ML para actualización en tiempo real de órdenes

## Estado actual
🔲 Sin iniciar — pendiente de credenciales ML y definición de alcance

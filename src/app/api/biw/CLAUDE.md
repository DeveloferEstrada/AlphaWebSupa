# API Bi World Wide (BiW)

## Responsable
Integración con cliente externo Bi World Wide. Consume catálogo de productos MegaAudio.

## Qué hace esta área
Expone endpoints REST consumidos por Bi World Wide (cliente externo, no usuario Supabase).
La autenticación es con Bearer token estático — no usa Supabase Auth.

## Autenticación
- Header requerido: `Authorization: Bearer <BIW_BEARER_TOKEN>`
- `BIW_BEARER_TOKEN` vive en env vars de Vercel (nunca en código)
- Si el token no coincide → 401

## Endpoints existentes

### `GET /api/biw/catalogo`
Devuelve el catálogo completo BASE.CSV en formato XLSX.

**Flujo:**
1. Valida Bearer token
2. Si `BUSART_MOCK=true` → usa datos de prueba locales (`mock-data.ts`)
3. Si no → POST a `http://200.188.56.106:4080/Bus-Art` con `{"Articulo":"BASE.CSV"}`
4. Omite la primera línea del CSV (metadata "Fecha Actualizacion: ...")
5. Parsea CSV con SheetJS (`xlsx` package) y convierte a XLSX
6. Responde con binario `.xlsx`

**Archivos:**
```
catalogo/route.ts    ← lógica principal
catalogo/mock-data.ts ← 15 productos de muestra para pruebas
```

## Variables de entorno
```
BIW_BEARER_TOKEN   ← token secreto compartido con Bi World Wide
BUSART_MOCK        ← true = mock, false/ausente = Busart real
```

## Busart (Alpha ERP)
- URL: `http://200.188.56.106:4080/Bus-Art`
- Método: POST, Content-Type: application/json
- Body: `{"Articulo":"BASE.CSV"}`
- Respuesta: CSV con primera línea de metadata + headers + filas de productos
- Timeout: 60 segundos (archivo puede ser grande)
- Israel Martínez actualiza el BASE en Alpha ERP — ese cambio se refleja automáticamente

## Estructura CSV Base (columnas principales)
GTIN, Supplier ID, Country Code, Product Type, SKU, Stock Quantity, Stock Date,
MMN, Product Category 1/2/3, Product Brand, Name1, Short/Long Description1,
Image 1/2/3 URL, Currency, MSRP, Street Price, Product Cost, Lead Days,
Handling Cost, Shipping Cost, Drop Ship Fee, Discounted Cost, Tax Pctg

## Al agregar nuevos endpoints BiW
- Mismo patrón de autenticación (verificar Bearer contra env var)
- Documentar aquí el nuevo endpoint con su flujo
- Si llama a otro endpoint de Busart, agregar el body en esta documentación

# ERP Migration — Alpha Micro → Supabase

## Equipo
| Persona | Rol | Cuenta Claude |
|---------|-----|---------------|
| Nathan | Líder de proyecto + conocimiento ERP | nathan@mega-audio.com.mx |
| Fernando | Líder de desarrollo | su cuenta |
| Marco | Desarrollador | su cuenta |

## Proyecto Supabase destino
`Sistema-Alpha-Migracion` — ya tiene la estructura del ERP espejo.
Backup confirmado: 07 Jul 2026 07:30:14 (PHYSICAL). Seguro para trabajar.

## Estado del ERP Legacy (Alpha Micro System)
- Corre en **servidor local** de Mega Audio
- Máximo 5 tablas con estructura obsoleta (campos pipe-separated y comma-separated)
- Documentación completa del ERP reside en la sesión Claude de Nathan
- Puentes hacia Alpha Micro: Busart, Art-Cib + varios más (a documentar)
- Un desarrollador disponible para crear nuevos bridge endpoints

## Primera entidad a migrar: Productos
Razón: es la base de todo — marketplaces, KPIs e inventario dependen de productos.

### Qué necesitamos antes de escribir una sola tabla
1. Nathan comparte la estructura real de las tablas de Alpha Micro (campos, pipes, significados)
2. Definir el schema limpio y normalizado para `productos` en Supabase
3. Crear el bridge endpoint que extrae productos de Alpha Micro en formato limpio
4. Script de transformación: pipe-separated → filas normalizadas
5. Validar con datos reales antes de hacer la migración definitiva

## Schema objetivo (schema `erp` en Supabase)
A definir con Nathan una vez que comparta la documentación del ERP.
Las tablas limpias reemplazarán la estructura pipe-separated de Alpha Micro.

## Regla de migración
- Alpha Micro sigue siendo la fuente de verdad mientras dure la transición
- Supabase `erp` se alimenta desde Alpha Micro vía bridges (no edición directa)
- Solo cuando un módulo esté 100% estable en Supabase se desconecta Alpha Micro para ese módulo

## Otros proyectos Supabase
| Proyecto | Decisión |
|----------|----------|
| `Compras-inteligentes` | Pausar sin respaldo (sandbox) |
| `Mega-Devoluciones` | Pausar sin respaldo (sandbox) |
| `Sistema-Alpha-Migracion` | **Proyecto activo de migración** |
| `Alpha Web Supa` | Proyecto principal (CXC, APIs, auth) |

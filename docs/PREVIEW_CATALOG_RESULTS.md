# Paso 24 — Catálogo SQL real de Preview

Fecha: **2026-09-21**. Destino confirmado en la URL y encabezado del SQL Editor:
`bar_tools_preview`, referencia `mfwoutniamoldcieoqvc`. Production no se consultó.

Se ejecutaron **dos consultas SELECT de inspección**, sin DDL, DML, llamadas de
aprovisionamiento ni SQL dinámico. La primera devolvió 14 secciones; la segunda,
una fila de privilegios efectivos. El único acceso a datos de Auth fue un
`count(*)`; no se leyeron emails, identidades, contraseñas ni tokens.
La versión legible de ambas consultas está en
[`preview_catalog_inspection.sql`](../supabase/operations/preview_catalog_inspection.sql).
En el editor se usó el mismo SQL con formato compacto para la primera consulta.
No se guardó un snippet mediante Save; el servicio puede conservar su historial
normal de ejecución. No se vinculó la CLI ni se ejecutaron migraciones.

## Resultados comprobados por SQL

| Comprobación | Resultado |
| --- | --- |
| Base de datos / operador | `postgres` / `postgres`. |
| Versión SQL | PostgreSQL `17.6`; Dashboard había identificado build `17.6.1.166`. |
| search_path de sesión | `"\\$user", public, extensions`, tal como fue reportado en el resultado. El wrapper de migración debe fijar el suyo explícitamente. |
| Relaciones en public | Ninguna en `pg_class`: sin tablas, vistas, secuencias ni índices en ese esquema. |
| Tipos en public | Ninguno en `pg_type`, incluidos los enums MVP. |
| Rutinas en public | Ninguna en `pg_proc`. |
| Políticas en public | Ninguna en `pg_policies`. |
| bar_private | No existe. |
| supabase_migrations | No existe el esquema ni `schema_migrations`; no hay ledger que leer o reparar todavía. |
| Auth | `auth.users` existe y contiene **0 filas**. |
| Columnas Auth requeridas | `id` UUID no nullable; `email_confirmed_at`, `phone_confirmed_at`, `confirmed_at` timestamptz nullable; `is_anonymous` boolean no nullable. |
| Dependencias | `auth.uid()` y `gen_random_uuid()` existen. `pgcrypto` 1.3 instalado en `extensions`. |
| Otros extensions | pg_stat_statements 1.11, plpgsql 1.0, supabase_vault 0.3.1, uuid-ossp 1.1. |

Esquemas no internos devueltos: `auth`, `extensions`, `graphql`, `graphql_public`,
`public`, `realtime`, `storage`, `vault`. El selector de Dashboard había mostrado
también `pgbouncer`; la consulta excluye nombres `pg_%`, por lo que no usar esta
lista filtrada para afirmar su inexistencia.

Los seis event triggers de plataforma observados en el paso 22 fueron confirmados
por `pg_event_trigger`, propiedad de `supabase_admin` y habilitados (`O`):
`issue_graphql_placeholder`, `issue_pg_cron_access`, `issue_pg_graphql_access`,
`issue_pg_net_access`, `pgrst_ddl_watch`, `pgrst_drop_watch`.
No se crearon, deshabilitaron ni modificaron triggers.

## Permisos efectivos y defaults

Existen `anon`, `authenticated`, `postgres` y `service_role`; ninguno es superuser.
`postgres` y `service_role` tienen BYPASSRLS; los otros dos no. Los cuatro tienen
USAGE en `public`, pero solo `postgres` tiene CREATE en él entre los roles revisados.
`public` pertenece a `pg_database_owner`; PUBLIC tiene USAGE, no CREATE.

La segunda consulta confirma para el operador `postgres`, todos en **true**:
USAGE en `auth`, SELECT en `auth.users`, REFERENCES sobre `auth.users.id`, EXECUTE
en `auth.uid()`, CREATE en `public` y CREATE de esquemas en la base actual.
Esto cubre prerrequisitos relevantes, sin demostrar que cualquier DDL futuro
vaya a ejecutarse correctamente bajo las restricciones del alojamiento.

Hallazgo: desactivar exposición automática **no equivale a ausencia de defaults**.
`pg_default_acl` contiene:

| Propietario creador / esquema | Objeto | Grants explícitos observados |
| --- | --- | --- |
| postgres / public | Tablas | postgres: `arwdDxtm`; anon/authenticated/service_role: `Dxtm`. |
| postgres / public | Secuencias | postgres: `rwU`. |
| postgres / public | Funciones | postgres: `X`. |
| supabase_admin / public | Tablas | postgres/anon/authenticated/service_role: `arwdDxtm`. |
| supabase_admin / public | Secuencias | Los mismos cuatro roles: `rwU`. |
| supabase_admin / public | Funciones | Los mismos cuatro roles: `X`. |

En ACL PostgreSQL, `Dxtm` representa TRUNCATE, REFERENCES, TRIGGER y MAINTAIN;
`arwd` INSERT, SELECT, UPDATE y DELETE; `rwU` SELECT, UPDATE y USAGE de secuencias;
`X` EXECUTE. Los defaults específicos de esquema no bastan para deducir todos los
permisos finales, especialmente EXECUTE de PUBLIC en funciones recién creadas.

**No se cambiaron defaults.** La migración 002 ya revoca todos los privilegios de
PUBLIC/anon/authenticated/service_role sobre las siete tablas antes de otorgar
solo SELECT a authenticated. También revoca ejecución por defecto de funciones
y protege tabla/secuencia de auditoría. Se revisaron esas instrucciones en el
archivo, sin ejecutarlas. Después de migrar será obligatorio comprobar grants
efectivos y RLS; futuras tablas también necesitan grants explícitos revisados.

## Dictamen y siguiente paso

**El catálogo inspeccionado es compatible con el camino de instalación inicial
vacía: 001 + 002 en una misma transacción.** No hay objetos MVP, datos Auth ni
ledger que indiquen una instalación parcial o requieran backfill hoy. No aplicar
002 sola ni exponer una ejecución aislada de 001.

Esto es compatibilidad de prerrequisitos, **no autorización de instalación** ni
prueba de la migración alojada. Las versiones alojadas difieren de la prueba
local; todavía faltan ejecución y pruebas de permisos con identidades sintéticas
expresamente autorizadas.

El siguiente paso acordado es revisar recuperación de Preview si una migración
falla. El plan actual carece de backups administrados verificados. Definir respaldo,
restauración y responsable antes de autorizar la instalación. Revalidar este
catálogo si cambia el proyecto o transcurre tiempo antes de migrar.

No se crearon usuarios, perfiles, tablas, tipos, funciones o políticas; no se
insertaron fixtures, vinculó CLI, cambió Auth/API, publicó Vercel ni modificó
Production. No hubo commit, push o merge.

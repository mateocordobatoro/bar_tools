# Paso 20 — Pendientes y revisión previa del entorno alojado

## Current application gate — 2026-09-22

Step 30: [controlled Preview deployment plan](PREVIEW_DEPLOYMENT_PLAN.md) verifies
Vercel Production tracks `main`, other branches deploy to Preview, and Preview
variables target `mfwoutniamoldcieoqvc`. No authentication build/hostname exists
yet. A push will automatically deploy Preview and needs explicit authorization.
Old-manager isolation and new synthetic application identities remain approval
gates; password login requires no Auth redirect changes. Nothing was deployed.

Steps 27–28 completed Preview schema installation and 148 hosted database tests.
The Next.js authentication foundation is now implemented locally; see
[APPLICATION_AUTH.md](APPLICATION_AUTH.md). The historical Production review below
must not be interpreted as current Preview status.

**Pending isolation/deactivation of the synthetic management account blocks its
reuse for application testing.** The active Step 28 manager remains unchanged;
its Auth UUID is `048235bd-f68b-4e2b-a603-c58eee75c99d`. No use, deactivation or
cleanup occurred in this application phase. See [PRODUCT_BACKLOG.md](PRODUCT_BACKLOG.md)
for the separately approved test-account procedure and lifecycle decision.

Before Vercel Preview login testing: authorize a build/deployment, verify the actual
Preview hostname and Preview-only public variables, approve test identities and
access, then run login/session/role/deactivation tests there. Record the exact
callback URL from the auth runbook before any PKCE flow. Hosted settings, users,
fixtures, migrations, grants and ledger remain untouched. Invitations/recovery,
mail delivery, database defaults/history reconciliation and Production promotion
remain separate pending work. No commit, push or deploy is authorized here.


Revisión de Production al 2026-09-20: **Dashboard revisado en solo lectura; no desplegar aún**.
Los permisos del navegador ya funcionan. No se ejecutó SQL, se cambiaron ajustes,
se crearon usuarios ni se enviaron invitaciones. No se revelaron claves o tokens.

Actualización 2026-09-21: se creó Preview y se separaron variables; ver
[PREVIEW_SETUP.md](PREVIEW_SETUP.md). Este informe describe la revisión anterior
de Production, no el preflight del nuevo proyecto.

## Destino y evidencia

El usuario confirmó que hay un único Supabase `bar_tools` conectado al único
proyecto Vercel en **Production, Preview y Development**, sin usuarios reales
ni datos operativos. Se trata como Production aunque todavía sea un scaffold.
Esa vinculación fue comunicada por el usuario; no se inspeccionaron valores de
variables Vercel. No llamar a este proyecto «desarrollo aislado».

El Dashboard de la organización `mateocordobatoro's Org`, proyecto `bar_tools`,
rama `main`, región `us-east-1`, fue observado entre el 19 y 20 de septiembre.
La referencia del destino se verificó visualmente en la URL y ajustes generales;
no se copian credenciales, información de usuarios ni filas de negocio aquí.

Pruebas previas: [54 aserciones SQL y cinco escenarios concurrentes](DATABASE_TEST_RESULTS.md)
y [155 comprobaciones del stack local](SUPABASE_STACK_TEST_RESULTS.md).
Ninguna equivale a una prueba de login dentro de Next.js ni de invitaciones alojadas.

## Resultados del Dashboard

| ID | Área | Resultado observado / fuente | Pendiente |
| --- | --- | --- | --- |
| R01 | Identidad y aislamiento | `bar_tools`, `main`, `us-east-1`; compartido por los tres entornos Vercel según el usuario. | Separación obligatoria antes de pruebas alojadas. |
| R02 | Salud y versiones | Resumen Healthy; General: Postgres 17.6.1.166, Auth 2.197.0, PostgREST 14.5. Un aviso general de incidencia apareció durante parte de la revisión y ya no aparecía al continuar el día 20. | Revalidar salud antes de despliegue; no inferir alcance o resolución de la incidencia. |
| R03 | Esquema | Database Tables: 0 tablas en `public`; Enumerated Types: sin enums en `public`; Migrations: Run your first migration. Selector de esquemas no mostraba `bar_private` ni `supabase_migrations`. | Catálogo y ledger definitivos sin consultar por SQL; esto no certifica ausencia de todo objeto o drift. |
| R04 | Data API y permisos | API habilitada; `public` y `graphql_public` expuestos; sin tablas ni funciones disponibles en esos controles. Exposición automática de tablas nuevas activada; extra search path `public, extensions`; max rows 1000. Resumen Advisor sin hallazgos. | Revisar grants/default privileges mediante preflight; decidir exposición automática antes de nuevas tablas. RLS del MVP aún no existe porque sus tablas no aparecen. |
| R05 | Auth | Email enabled; Allow new users to sign up ON; anonymous sign-ins OFF; Confirm email ON; manual linking OFF. | Registro público incompatible con el modelo de personal por invitación. Proponer deshabilitarlo en una acción posterior autorizada; conservar email. |
| R06 | Sesiones | JWT 3600 s; detección de refresh comprometido ON; reutilización 10 s. Sesión única OFF, duración/inactividad 0 (never), controles bloqueados por plan. Refresh 150/5 min/IP; verificaciones y signup/login 30/5 min/IP; forwarding OFF. | Acordar política para dispositivos compartidos; no se probaron recuperación ni expiración alojadas. Campo de límite de correo sin valor legible. |
| R07 | URLs | Site URL `http://localhost:3000`; No Redirect URLs. | Configurar dominios de cada entorno cuando exista un callback probado; no invitar todavía. |
| R08 | Correo | SMTP Settings: custom SMTP OFF. | Entrega, remitente, restricciones e invitaciones sin verificar; configurar y probar con destinatario autorizado posteriormente. |
| R09 | Recuperación | Resumen No backups; Backups indica que Free Plan no incluye backups del proyecto. | Definir respaldo protegido y probar restauración; no se realizó exportación ni compra de plan. |
| R10 | Vercel | El usuario confirmó un backend compartido. Revisión posterior directa: URL y nombre legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`, ambos All Environments; valores no revelados. | Preview usará el nuevo nombre publishable. Separación y rebuild pendientes; no se modificó Production. |

La prueba local usó Auth 2.196.0, PostgREST 16.2 y Postgres 17.6.1.167:
**no son versiones idénticas al alojamiento**. Probar las migraciones, permisos y
HTTP en el nuevo entorno alojado de desarrollo antes de promoverlas a Production.
La API habilitada o el Advisor sin hallazgos no prueban los permisos futuros.
No se pulsó Save, Harden Data API ni se alteró ningún interruptor.

## Hallazgos que requieren acciones posteriores

1. Compartir Production con Preview y desarrollo permite que código de prueba
   alcance el mismo backend. Adoptar [la estrategia de entornos](ENVIRONMENT_STRATEGY.md).
2. Registro público habilitado: cerrar auto-registro antes de habilitar personal.
3. Exposición automática activa: proponer deshabilitarla para futuras tablas y
   mantener grants explícitos en migraciones. Validar esa configuración en
   desarrollo; no relajar la migración 002 ni habilitar acceso directo a escrituras.
4. Sin backup disponible y sin restauración ensayada: recuperación aún no lista.
5. URLs locales, ausencia de redirects y SMTP propio deshabilitado: invitaciones
   y acceso operativo no preparados. Login/callback/renovación en Next.js siguen
   sin implementar; el adaptador SSR probado no sustituye esas rutas.

El preflight SQL existente no se ejecutó. La lectura del Dashboard fue suficiente
para esta revisión inicial; la comprobación definitiva del catálogo sigue abierta.

## Pendientes y criterios de cierre

| ID | Pendiente | Responsable propuesto | Bloquea | Criterio de cierre |
| --- | --- | --- | --- | --- |
| D00 | Separar desarrollo de Production | Responsable + operador | Primera migración alojada | Proyecto de desarrollo independiente y asignación de variables revisados según ENVIRONMENT_STRATEGY.md. |
| D01 | Completar R01–R04 y R09 | Operador del proyecto | Migración remota | Evidencia del destino, salud, estado del esquema y recuperación revisada. |
| D02 | Preflight SQL y comparación con 001 | Operador + revisión técnica | Migración remota | Lectura autorizada del catálogo, ledger, grants, políticas y presencia de datos; estado compatible confirmado. |
| D03 | Aprobar decisiones de dominio | Responsable del producto | Migración remota | Aprobación registrada de la tabla de decisiones del runbook, especialmente aprobación de recetas por management, unidades, rendimiento parcial, cancelación y auditoría. |
| D04 | Respaldo y autorización de ejecución | Operador + responsable | Migración remota | Respaldo protegido verificable, recuperación acordada, archivos exactos revisados y autorización del destino/operación. |
| A01 | Revisar R05–R08 y R10 | Operador + desarrollo | Acceso de usuarios | Configuración coherente con el flujo acordado y los entornos. Registrar correcciones; aplicarlas en una acción posterior autorizada. |
| A02 | Login y sesiones en Next.js | Desarrollo | Acceso de usuarios | Login, callback, renovación y propagación de cookies, identidad verificada en servidor, autorización de rutas/acciones, logout y ausencia de caché pública de sesiones probados. |
| A03 | Invitaciones y recuperación | Desarrollo + operador | Primer usuario operativo | Flujo de invitación y recuperación implementado y probado con destinatario de prueba autorizado, incluyendo enlaces caducados/inválidos. No enviar invitaciones en este paso. |
| A04 | Pruebas alojadas posteriores | Desarrollo + operador | Acceso de usuarios | Verificación del esquema y pruebas acordadas de roles, desactivación y sesiones en el proyecto de desarrollo; nunca ejecutar fixtures destructivos sobre él. |
| A05 | Primer management | Responsable + operador | Operación real | Identidad confirmada y aprobada; bootstrap privado según runbook, tras autorización específica. |

El esquema puede desplegarse con acceso de aplicación cerrado una vez resueltos
D00–D04. Eso **no** habilita el uso operativo: A01–A05 siguen siendo necesarios.
No implementar PIN del lado cliente ni ampliar alcance a inventario o integraciones.

## Secuencia de despliegue que queda preparada

1. Aprobar la separación de entornos y preparar el proyecto independiente de
   desarrollo. Repetir allí la revisión: la evidencia del proyecto actual no
   describe un proyecto que todavía no existe.
2. Autorizar el preflight de solo lectura del
   [runbook](DATABASE_DEPLOYMENT.md#preparation-manual-after-approval).
3. Clasificar el destino: vacío compatible → 001 + 002 atómicamente; 001 idéntica
   y vacía → solo 002. Datos, esquema parcial, divergencia o ledger incoherente
   → detenerse y preparar un plan específico. Nunca asumir que un 404 permite migrar.
4. Cerrar D03–D04 y obtener autorización de ejecución. Usar los comandos del
   runbook; no ejecutar `db push`, `db reset`, reparaciones de ledger ni SQL aquí.
5. Verificar RLS/grants y demás invariantes, reconciliar el ledger tras verificar
   el éxito, mantener acceso operativo cerrado y seguir el plan de recuperación
   si falla la verificación.
6. Resolver el flujo de aplicación y las invitaciones antes de provisionar el
   primer usuario operativo.

**Conclusión actual: revisión de Dashboard realizada; despliegue no autorizado.**
Las pruebas locales no constituyen aprobación de despliegue.

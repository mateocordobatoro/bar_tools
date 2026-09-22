# Paso 22 — Preflight de Supabase Preview

Revisión del Dashboard realizada el **2026-09-21**, en modo lectura.
Destino verificado: `bar_tools_preview`, referencia `mfwoutniamoldcieoqvc`,
rama Supabase `main`, región `us-east-1`. Esta rama pertenece al proyecto Preview;
no es el proyecto Production `bar_tools` (`njhcumxecwrrpbmjfdti`).

**No se vinculó la CLI, ejecutó SQL, guardó configuración, creó usuarios ni
publicó un deployment.** Solo se cambiaron filtros de lectura del Dashboard.
Las claves y los datos personales no forman parte del informe.

## Actualización — Paso 23, 2026-09-21

Con autorización explícita del usuario se cambió únicamente `Allow new users to
sign up` de ON a OFF en `bar_tools_preview` (`mfwoutniamoldcieoqvc`). Se guardó y
se verificó el valor OFF después de recargar la página de proveedores.
Email continúa Enabled, Confirm email ON, anonymous sign-ins OFF y manual
linking OFF. Production no fue modificado.

No se intentó un signup por API, para evitar crear una identidad si hubiera un
fallo de configuración. La evidencia de este paso es el ajuste persistido en el
Dashboard; su denegación efectiva se comprobará en las pruebas autorizadas de Auth.
No se vinculó CLI, ejecutó SQL ni se crearon usuarios o deployments.

Las tablas y propuestas siguientes conservan el estado histórico del Paso 22;
el cambio de signup propuesto allí ya está completado. Los otros pendientes
siguen abiertos.

Actualización Paso 24: la inspección SQL autorizada ya se realizó; ver
[PREVIEW_CATALOG_RESULTS.md](PREVIEW_CATALOG_RESULTS.md). El resto de este informe
conserva la evidencia y límites de la revisión de Dashboard del Paso 22.

## Catálogo observado

| Vista del Dashboard | Resultado |
| --- | --- |
| Overview | Healthy; sin repositorio GitHub conectado; resumen Advisor sin hallazgos. |
| Database → Tables, schema public | 0 tablas. Las siete tablas MVP todavía no aparecen. |
| Enumerated Types, public | Sin enums. |
| Functions, public | Sin funciones. |
| Triggers → Data, public | Sin triggers de datos. |
| Policies, public | No tables to create policies for. No hay políticas MVP que verificar aún. |
| Selector de esquemas | auth, extensions, graphql, graphql_public, pgbouncer, public, realtime, storage y vault. No aparecen bar_private ni supabase_migrations. |
| Migrations | Run your first migration; sin entradas visibles. |
| Auth → Users | No users in your project. No se crearon identidades de prueba. |
| Backups | El plan Free no incluye backups del proyecto. No se verificó restauración. |

La vista Event Triggers tenía inicialmente el filtro `Owner=postgres` y mostraba
cero entradas. Al incluir también `supabase_admin`, aparecieron seis:
`issue_graphql_placeholder`, `issue_pg_cron_access`, `issue_pg_graphql_access`,
`issue_pg_net_access`, `pgrst_ddl_watch` y `pgrst_drop_watch`, con funciones en
`extensions`. No se modificaron. No se observó un trigger de RLS automático;
no confundir el filtro inicial vacío con ausencia de triggers de plataforma.

Esta es evidencia del catálogo servido por el Dashboard, no una consulta SQL
independiente ni una auditoría exhaustiva de `pg_catalog`. No certifica todos los
ACL/default privileges, propietarios, objetos ocultos o el estado físico del
ledger. La evidencia es compatible con un MVP aún no instalado. El preflight SQL
preparado sigue pendiente para una fase expresamente autorizada; este paso no
permite ejecutar SQL para completar esos detalles.

## Auth y API: valores actuales y acciones propuestas

| Ajuste | Observado en Preview | Acción posterior |
| --- | --- | --- |
| Allow new users to sign up | ON | **Cambiar a OFF**, tras autorización, antes de pruebas con identidades de personal. |
| Email provider | Enabled | Mantener: deshabilitar el registro público no debe deshabilitar email login. |
| Allow anonymous sign-ins | OFF | Mantener. |
| Confirm email | ON | Mantener; usar identidades de prueba confirmadas mediante un flujo administrativo autorizado. |
| Allow manual linking | OFF | Mantener. |
| Enable Data API | ON | Mantener para el cliente Supabase y las pruebas PostgREST. |
| Exposed schemas | public, graphql_public | Mantener para esta migración; no exponer bar_private cuando se cree. Quitar GraphQL no es requisito de esta fase. |
| Automatically expose new tables | OFF | Correcto; mantener. La migración otorgará explícitamente SELECT y ejecución de RPC a los roles previstos. No ampliar grants para hacer pasar pruebas. |
| Extra search path | public, extensions | Sin cambio propuesto; las funciones de seguridad de la migración fijan su search_path. |
| Max rows / Pool size | 1000 / campo sin valor | Sin cambio propuesto. |
| Site URL | http://localhost:3000 | Pendiente del flujo de login y dominio Preview real; no inventar un callback ni usar el dominio Production. |
| Redirect URLs | Ninguna | Añadir solo URLs aprobadas cuando exista la ruta de callback y el deployment nuevo. |
| Custom SMTP | OFF | Preparar entrega/remitente y probar invitaciones posteriormente; no enviar emails en este paso. |

**Cambio inmediato propuesto: solo deshabilitar el registro público en Preview.**
No se detecta otro cambio de Data API necesario antes de la migración preparada.
RLS se habilita explícitamente en las siete tablas dentro de 002; no se propone
activar un trigger global adicional ni pulsar Harden Data API, que cambiaría el
modelo de exposición. Los grants reales se verificarán después de aplicar SQL.

URLs y SMTP bloquean la validación completa de invitaciones/login, pero no la
creación del esquema. Las futuras pruebas backend con usuarios sintéticos pueden
usar un procedimiento administrativo aprobado; eso no prueba entrega de correo
ni el login de Next.js. No usar el signup público como atajo de aprovisionamiento.

## Sesiones, límites y compatibilidad

- Access token: 3600 segundos; detección de refresh comprometido ON; intervalo
  de reutilización 10 segundos.
- Sesión única OFF; duración e inactividad 0 (sin límite). Esos controles están
  bloqueados por el plan. Antes del uso en dispositivos compartidos debe acordarse
  la política de sesión y probarse logout/desactivación; no se contrataron funciones.
- Por IP: refresh 150/5 min; verificaciones 30/5 min; signup/login 30/5 min.
  IP forwarding OFF. El campo de límite de email estaba deshabilitado y sin valor
  legible: no se presupone capacidad de entrega ni un límite concreto.
- Preview: Postgres **17.6.1.166**, Auth **2.197.0**, PostgREST **14.5**.
  Coinciden con las versiones observadas anteriormente en Production. La prueba
  local usó Postgres 17.6.1.167, Auth 2.196.0 y PostgREST 16.2; por tanto falta
  verificar permisos y comportamiento HTTP con estas versiones alojadas.

## Orden de las siguientes autorizaciones

1. Autorizar el cambio concreto de signup en Preview. No tocar Production.
2. Acordar recuperación de Preview y revisar las decisiones de dominio del
   [runbook](DATABASE_DEPLOYMENT.md). Aunque no haya datos de aplicación,
   no se puede afirmar que haya un backup o restauración verificados.
3. Autorizar acceso de operador y preflight SQL sobre la referencia Preview
   exacta. CLI sigue sin vincular; el usuario ha pospuesto ese paso expresamente.
4. Tras verificar compatibilidad del catálogo, autorizar 001 + 002 en una sola
   transacción y verificar tablas, RLS, grants, funciones privadas y ledger.
5. Autorizar identidades y fixtures sintéticos exclusivos de Preview: management,
   bartender, inactivo y sin perfil. Probar denegación anónima, JWT manipulado,
   escalada por metadata/escrituras directas, inmutabilidad de versiones, validación
   de cantidades, reintentos, actores, bloqueos/reanudación/READY y desactivación.
   No ejecutar los runners locales desechables contra este proyecto alojado.
6. Publicar después el **código nuevo** en Vercel Preview, que reconoce
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. No redesplegar código antiguo suponiendo
   compatibilidad. Validar luego login, callbacks, cookies e invitaciones según
   su implementación. Production se prepara cuando el MVP funcione en Preview.

Las pruebas existentes no autorizan una migración ni la creación de usuarios.
El resultado de este paso es una lista verificable de acciones, no un despliegue.

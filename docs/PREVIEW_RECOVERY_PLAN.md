# Paso 25 — Plan de recuperación de la instalación inicial

> Step 27: instalación única completada y verificada en Preview. El usuario
> aceptó el riesgo residual; no hay backup administrado ni restauración garantizada.
> Véase [resultado final](PREVIEW_INSTALLATION_RESULTS.md). Los estados pendientes
> del plan original que aparecen debajo son históricos; no reejecutar 001/002.


Estado: preparado para revisión; **no autoriza ejecutar SQL, vincular la CLI,
crear usuarios ni desplegar la aplicación**. No se ha instalado el esquema remoto.

## Destino y alcance

- Único candidato: `bar_tools_preview`, referencia `mfwoutniamoldcieoqvc`.
- Excluido: `bar_tools`, referencia `njhcumxecwrrpbmjfdti`, conectado a Production.
- [Paso 24](PREVIEW_CATALOG_RESULTS.md) verificó un catálogo público vacío,
  sin `bar_private`, sin historial de migraciones y sin usuarios Auth. Se debe
  repetir la inspección antes de ejecutar: la evidencia anterior no bloquea cambios.
- Preview está en Free y no dispone de backups administrados. No existe aquí
  una copia cuya restauración se haya probado. Este plan **no garantiza restaurar
  el proyecto**, ni cubre pérdidas después de crear usuarios o datos.

## Procedimiento transaccional propuesto

Usar una sola invocación de `psql`, con ambos archivos y `ON_ERROR_STOP`.
Según [PostgreSQL: psql](https://www.postgresql.org/docs/17/app-psql.html),
`--single-transaction` envuelve los comandos/archivos en una transacción y,
con esa variable, aborta al encontrar un error. `-X` evita cargar un psqlrc.
Los archivos revisados no contienen control de transacciones ni operaciones
que requieran ejecutarse fuera de una transacción. Revalidar si cambian.

SHA-256 de los archivos revisados:

| Archivo | SHA-256 |
| --- | --- |
| `001_init.sql` | `b6f3f21b8052a8d01c30a0410a207118de16cc5de50a3bd92645cc1b08f18b71` |
| `002_secure_mvp.sql` | `013f63f7e9d5b3e429e62b9262380b8c2ac818a2306c483e5089d49cda5416a3` |

Comando para una autorización futura, desde la raíz del repositorio:

```sh
psql 'service=bar_tools_preview' -X -v ON_ERROR_STOP=1 --single-transaction \
  -c "SET LOCAL search_path = public, pg_catalog; SET LOCAL lock_timeout = '5s'; SET LOCAL statement_timeout = '60s'" \
  -f supabase/migrations/001_init.sql \
  -f supabase/migrations/002_secure_mvp.sql
```

El servicio libpq todavía no está configurado. Su nombre no demuestra el destino:
antes de usarlo, el operador debe cotejar host y usuario con **Connect del proyecto
Preview exacto**, usar conexión directa o session pooler y TLS. La base `postgres`
y `current_database()` por sí solas no identifican el proyecto. Contraseña mediante
prompt o archivo privado 0600; nunca en comandos, informes, chat o repositorio.
No se necesita una clave service-role. La CLI permanece sin vincular.

No sustituir este procedimiento por dos ejecuciones del SQL Editor, un `db push`
o llamadas HTTP independientes. La evidencia local corresponde al comando psql.
Las migraciones 001 y 002 deben confirmarse juntas: 001 sola deja el esquema legado.

## Preparación y registro antes de autorizar

1. El responsable del proyecto confirma destino, operador y ventana exclusiva.
   Mantener sin usuarios, fixtures, escritores y despliegues de aplicación.
2. Repetir `supabase/operations/preview_catalog_inspection.sql` en ese destino.
   Comparar con Paso 24: catálogo vacío, cero usuarios, dependencias/privilegios
   disponibles; detenerse ante cualquier deriva. Revisar los event triggers
   alojados; las pruebas locales no reproducen todos los triggers de la plataforma.
3. Guardar en ubicación privada la inspección, configuración Auth/API relevante,
   referencias, archivos SQL y sus hashes. Una copia de esquema con `pg_dump
   --schema-only` puede aportar evidencia adicional, pero no contiene usuarios,
   datos ni toda la configuración y **no equivale a un backup restaurable**.
4. Elegir: conseguir un backup soportado y ensayar restauración, o aceptar
   explícitamente el riesgo de pérdida/recreación de este Preview vacío. Esa
   aceptación no se ha dado y nunca se extiende automáticamente a Production.
5. Tras la autorización, ejecutar una vez y registrar código de salida, resultado
   de COMMIT y errores sanitizados. No registrar credenciales ni volcar respuestas
   con datos personales. Verificar inmediatamente antes de habilitar accesos.

## Decisión según el resultado

| Evidencia | Acción |
| --- | --- |
| Error SQL antes del commit (3 en archivo; se observó 1 con `-c`) | Cerrar la sesión, reconectar al mismo destino e inspeccionar. Solo declarar rollback confirmado si se conserva el catálogo inicial; revisar la causa y obtener autorización antes del reintento. |
| Error del cliente/archivo o SQL con `-c` (puede ser 1) | Inspeccionar el catálogo; no inferir por el código que nunca llegó a ejecutar SQL. |
| Desconexión, timeout o resultado de COMMIT no recibido (incluido código 2) | Estado **desconocido**. No repetir migraciones ni reparar el historial. Comprobar sesiones/transacciones activas y el catálogo mediante una conexión nueva; esperar a que termine la sesión anterior antes de clasificar. |
| Salida 0 y commit confirmado | Ejecutar `verify_foundation.sql`, revisar las definiciones contra ambos archivos y comprobar catálogo, permisos y Security Advisor. El éxito del cliente no sustituye esta verificación. |
| Esquema completo y seguro, pero historial ausente | Es esperable con psql. Reconciliar el historial solo después de verificar y con autorización separada; no reinstalar por ausencia del ledger. |
| Esquema parcial, objetos inesperados o comprobación fallida | Detener la publicación. Conservar evidencia, investigar y preparar una migración correctiva revisada. No aplicar limpieza destructiva automática. |

Para distinguir vacío de completo, inspeccionar relaciones, tipos, funciones,
políticas, permisos, `bar_private`, extensiones e historial. Tras éxito deben existir
las siete tablas MVP con RLS y SELECT autenticado controlado por políticas, sin
escritura directa ni lectura anónima, sin `pin_hash`, con RPCs restringidas y cero
usuarios/datos creados por esta instalación. Usar las consultas de verificación,
no solo contar tablas. Si la transacción anterior sigue activa, una lectura vacía
no demuestra rollback: podría confirmar después.

## Recuperación y límites

PostgreSQL ofrece atomicidad para el DDL y los permisos transaccionales utilizados;
los cambios no confirmados no son visibles desde otra conexión. Véase
[transacciones](https://www.postgresql.org/docs/17/tutorial-transactions.html).
Esto no es un backup ni revierte un commit ya completado. Tampoco garantiza borrar
logs de plataforma, efectos externos o consumos de secuencias en otros procedimientos.

- **Antes del commit:** un error aborta el conjunto; confirmar estado tras cerrar
  la conexión. Corregir el problema y revisar nuevamente antes de reintentar.
- **Después del commit:** mantener suspendido el acceso y corregir hacia adelante
  con nueva migración aprobada. Nunca volver a 001, desactivar RLS ni ampliar grants.
- **Preview vacío irrecuperable:** se puede proponer crear otro proyecto aislado y
  reaplicar configuración y esquema revisados. Es una reconstrucción, no una
  restauración. Requiere nueva autorización, disponibilidad/cuota y cambios de
  referencias/variables en local y Vercel Preview/Development, más nueva validación.
  No borrar automáticamente el proyecto anterior ni tocar Production.
- **Si aparecen usuarios o datos:** este plan deja de ser suficiente. Preservarlos,
  obtener una copia protegida y preparar reparación o restauración probada. No
  truncar tablas, eliminar usuarios ni usar `db reset --linked` como recuperación.

No hay RPO/RTO garantizados ni ensayo de restauración desde backup. Una pérdida
del proyecto sin copia puede ser permanente. La separación de Production reduce
el alcance del incidente, pero no elimina ese riesgo.

## Evidencia local y decisión pendiente

`scripts/database-atomicity.mjs` prueba el comando psql en PostgreSQL desechable:
error de archivo después de 001, error después de 002 antes del commit, error
SQL mediante `-c`, archivo faltante,
invisibilidad desde otra sesión y desconexión antes del commit, y commit exitoso.
Compara el catálogo con su estado inicial tras los fallos. Después se ejecutan
las comprobaciones existentes de RLS/grants, comportamiento y concurrencia.

No se simula una desconexión durante COMMIT, un fallo del servicio alojado ni la
restauración de un backup. El contrato Auth y el operador local son simulados;
el servidor alojado tiene versiones y event triggers distintos. Estos límites
impiden prometer una restauración garantizada aunque pasen las pruebas.

La próxima autorización debe identificar Preview y estos archivos, aceptar las
decisiones funcionales del [runbook](DATABASE_DEPLOYMENT.md) y elegir explícitamente
la alternativa de backup o aceptar el riesgo residual del Preview vacío. No debe
incluir implícitamente usuarios, fixtures remotos, CLI, Vercel o Production.

Resultado local del Paso 25: **PASS** con psql 18.6 y servidor PostgreSQL 17.10.
Seis escenarios de atomicidad, verificación del catálogo, 54 aserciones de
comportamiento y cinco escenarios concurrentes pasaron. El código 1 observado
con error SQL en `-c` confirma que no se debe clasificar el resultado solamente
por el código de salida. También pasaron typecheck, build, los cinco contratos
estáticos y las 21 pruebas del probe. El clúster temporal se eliminó; ninguna
conexión remota fue utilizada por estas pruebas.

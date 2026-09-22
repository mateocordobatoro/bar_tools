# Separación de entornos antes del despliegue

Estrategia aceptada por el usuario al 2026-09-20; **variables configuradas; migraciones y nuevo deployment pendientes**. El usuario confirmó que `bar_tools`
alimenta Vercel Production, Preview y Development. La ausencia actual de datos
reales no convierte ese proyecto en un entorno desechable.

Estado actualizado: ver [PREVIEW_SETUP.md](PREVIEW_SETUP.md) para los destinos
verificados y lo que falta. Las notas de preparación al final son históricas.

## Estrategia recomendada

Mantener un proyecto Vercel con variables separadas por entorno y dos proyectos
Supabase alojados, además del stack local. Supabase documenta proyectos separados
para staging y producción; Vercel permite asignar variables por entorno.
Fuentes: [Supabase: Managing Environments](https://supabase.com/docs/guides/deployment/managing-environments)
y [Vercel: Environment variables](https://vercel.com/docs/environment-variables).

| Entorno | Backend propuesto | Uso |
| --- | --- | --- |
| Production | `bar_tools` actual, reservado para futura operación | Solo versiones y migraciones previamente validadas y aprobadas. |
| Preview | Nuevo proyecto independiente, nombre acordado `bar_tools_preview` | Pruebas alojadas y aceptación con datos sintéticos. |
| Development | Stack Supabase local por defecto; proyecto dev solo para pruebas alojadas deliberadas | Nunca descargar o usar configuración Production para trabajo diario. |
| Tests automatizados | Instancia local desechable por ejecución | Migraciones, fixtures y limpieza confinadas a la instancia creada por el runner. |

No hace falta crear un segundo proyecto Vercel para esta separación. Un backend
dev compartido no aísla distintas ramas entre sí: serializar pruebas que cambien
el esquema. Si se necesita concurrencia futura, evaluar proyectos/ramas aisladas
por PR. No resolver el aislamiento con una columna «environment» en tablas de
Production ni copiando usuarios o datos reales a dev.

## Orden propuesto, sujeto a aprobación

1. Aprobar la separación, el responsable y los costes/cuotas del nuevo proyecto.
   No se presupone capacidad gratuita ni se ha creado o contratado nada.
2. Crear Supabase dev independiente. Registrar privadamente su referencia y
   revisar Auth, API, versión y recuperación; no reutilizar credenciales admin.
3. Mantener las variables Production en el proyecto actual. Cambiar Preview al
   nuevo URL/key dev y Development al destino local o dev acordado. Mantener la
   pareja `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
   coherente. Nunca incluir claves privilegiadas en `NEXT_PUBLIC_*`.
4. Reconstruir los deployments afectados: las variables públicas de Next.js
   quedan incorporadas durante el build. Revisar deployments Preview antiguos
   que aún contienen el destino anterior y retirar/restringir su acceso mediante
   una acción autorizada. Un cambio de variables no los actualiza retroactivamente.
5. Ejecutar preflight y primera migración atómica **en dev**, con autorización;
   probar permisos y HTTP allí. No apuntar los runners desechables al proyecto
   alojado: preparar un procedimiento alojado específico con fixtures aprobados.
6. Configurar correo y URLs por entorno cuando existan callback/login probados.
   En dev, destinatarios de prueba autorizados; en Production, solo dominios y
   rutas de la aplicación real, sin redirects de Preview. No enviar invitaciones aún.
7. Antes de datos reales, acordar respaldo, retención, restauración y responsable;
   ensayar recuperación. Después, promover exactamente los archivos SQL revisados
   mediante una ejecución Production explícitamente aprobada. No automatizar
   migraciones en cada build Vercel o push de rama.

Si no se aprueba un segundo proyecto, continuar con pruebas locales y mantener
pendiente la validación alojada. No usar el proyecto conectado a Production como
sustituto desechable. El login y las invitaciones siguen siendo trabajo posterior.


## Registro histórico de preparación — 2026-09-20

El usuario eligió crear `bar_tools_preview`, asignar sus variables a Vercel y
verificar el destino antes de migrar. Formulario preparado en la organización
actual: us-east-1, Data API activa, exposición automática de tablas desactivada,
sin integración GitHub seleccionada. La creación espera que el usuario gestione
la contraseña y envíe el formulario; aún no existe una referencia Preview verificada.
La migración habilitará RLS explícitamente en sus siete tablas; el formulario no
ha añadido un trigger global de RLS.

La revisión directa de Vercel encontró `NEXT_PUBLIC_SUPABASE_URL` y el nombre
legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`, ambos con alcance All Environments.
No se revelaron sus valores. Esto corrige la afirmación anterior, comunicada por
el usuario, de que ya estaba configurado el nombre publishable. Para Preview se
preparará `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, compatible con esta rama.
Production conserva su configuración actual y no se desplegará esta rama todavía.

Verificación local sin red: `.env.local` todavía apunta al proyecto conocido de
Production y tiene la variable publishable; la CLI no tiene `supabase/.temp/project-ref`.
Por tanto, **todavía no se puede afirmar que Codex apunta a Preview**. No ejecutar
migraciones ni probes locales que se interpreten como validación Preview hasta
actualizar y verificar el destino. Los runners desechables siguen siendo independientes.

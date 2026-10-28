# Laboratorio local de Financial Hub

## Abrir en esta computadora

Desde PowerShell:

```powershell
cd "C:\Users\peric\Documents\Codex\verax-payout-tracking"
node scripts/local-lab.mjs
```

Web: http://127.0.0.1:5173 · Panel Firebase local: http://127.0.0.1:4000.

Cuentas ficticias del emulador:

- Administración: `lab-admin@verax.test`
- Analista: `lab-analyst@verax.test`
- Otro analista para pruebas de permisos: `lab-other@verax.test`
- Contraseña local de las tres: `Verax-Lab-2026!`

Estas cuentas no existen en producción. El laboratorio contiene 20 casos ficticios habilitados para solicitar pago. Los datos se recrean al iniciar los emuladores y no se exportan automáticamente. Para cambiar de rol, cerrar sesión o usar otra ventana del navegador. Ctrl+C cierra el laboratorio.

## Aislamiento

`.env.lab` contiene únicamente configuración ficticia del proyecto `demo-verax-lab`. Auth, Firestore, Functions y Storage se conectan a 127.0.0.1. El modo laboratorio rechaza un projectId distinto y rechaza ejecutarse desde un dominio remoto. Una franja identifica LABORATORIO LOCAL en todas las pantallas. El proyecto demo impide acceso a servicios reales no emulados. No importar comprobantes reales ni bases de producción.

## Requisitos

Node 22, Java 21+, dependencias raíz y de `functions` instaladas. El primer arranque puede descargar los emuladores. Si Java no está en PATH, definir JAVA_HOME. Esta computadora dispone de una configuración local ignorada por Git en `tmp/lab-runtime.json` para reutilizar el Java ya instalado. La carga inicial de Functions admite hasta 60 segundos en Windows.

## Prueba funcional

1. Entrar como analista y seleccionar los 20 casos.
2. Presentar una solicitud y comprobar número SOL, cantidad y total $500.005,00.
3. Entrar como administrador, aprobar y comprobar número OP y Pendiente de pago.
4. Descargar el PDF y revisar casos, importes y logo.
5. Registrar un pago ficticio, adjuntar PDF/JPG/PNG de prueba y confirmar el cotejo.
6. Comprobar estado Pagada, historial, acceso al comprobante y rechazo de acceso por otro analista.

## Validación automatizada

`npm run test:lab` levanta emuladores aislados y ejecuta un ciclo completo a través de Auth, callable, triggers y Storage reales de los emuladores. No llama directamente a `service.advance`. Verifica 20 casos, PDF, comprobante, referencia del pago, reintento idempotente y permisos. No ejecutarlo mientras el laboratorio interactivo ocupa sus puertos.

Validación ejecutada el 28/10/2026: ciclo completo aprobado. El host actual usó Node 24 para emulación; Functions declara Node 22 para nube. La verificación en servicios cloud, IAM y ubicación del trigger sigue siendo una etapa distinta.

## Estado de nube y producción

Se creó el proyecto `verax-financial-hub-lab` y su registro de aplicación web antes de optar por pruebas exclusivamente locales. No se vinculó facturación ni se desplegaron servicios. La activación de facturación fue rechazada por el usuario y no se reintentará sin autorización.

Producción `verax-financial-hub` tiene facturación habilitada, Firestore en `southamerica-east1`, API de Cloud Functions deshabilitada y ningún bucket listado al realizar la revisión. Su preparación y despliegue coordinado siguen pendientes. Vercel de producción no se modificó al crear este laboratorio.

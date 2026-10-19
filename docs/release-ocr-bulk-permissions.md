# OCR, staging, cambios masivos y permisos

## Comportamiento

- Extracción por coordenadas de ítems PDF: neto gravado para Monto Fact., subtotal sin IVA de los ítems de ahorro para Ahorro Total (Base). No duplica ORIGINAL/DUPLICADO/TRIPLICADO; avisa si no puede determinar un único siniestro o si los subtotales no coinciden.
- Importes de staging con separadores argentinos, dos decimales, ancho ajustable y desplazamiento horizontal. Los cálculos conservan centavos.
- Selección múltiple de casos visibles en el dashboard admin. Confirmación explícita de pago/cobro y fechas. Hasta 200 casos por transacción; si cambió alguno desde la selección, se rechaza todo. Los pagos con una solicitud vinculada se gestionan desde Solicitudes.
- Firestore deja de permitir acceso público. Roles y asignación se toman de userProfiles, que solo puede modificar un administrador. Se conserva el acceso propio del analista y la creación del espejo faltante mediante merge.
- Las solicitudes nuevas de honorarios admiten hasta 5 facturas para validar propiedad, estados e importes contra los documentos originales dentro de los límites de evaluación de Firestore. El analista puede presentar más de una solicitud. No se migran ni borran solicitudes anteriores.
- La aprobación administrativa consulta la regla vigente de facturación del analista; no confía en un indicador enviado por el solicitante.

## Validación reproducible

Node 22 y Java 21. Ejecutar `npm ci`, `npm test`, `npm run test:rules`, `npm run build`.
Las pruebas de reglas usan exclusivamente `demo-verax-tests` en 127.0.0.1:8085. No requieren credenciales ni escriben en producción.
La integración incluye consultas propias, bloqueo anónimo, escalamiento de rol, facturas ajenas, importes falsos, repetición de solicitudes, espejo faltante, comprobantes y una transacción admin de 200 facturas y 200 espejos.

Para repetir la extracción sobre documentos privados locales: `node scripts/check-invoice-pdfs.mjs <archivo.pdf>`. No se incluyen PDFs ni credenciales en el repositorio.

## Publicación

1. Comprobar que el administrador tiene userProfiles con role ADMIN/admin. Analistas: role analyst/ANALYST y analystKey coincidente con analista/analyst de sus facturas. isActive false bloquea acceso financiero.
2. Ejecutar las pruebas y publicar `firebase/firestore.rules` en el proyecto verax-financial-hub. El frontend y las reglas son despliegues separados: Vercel no publica reglas Firebase.
3. Desplegar la aplicación desde el PR validado y recargar las sesiones para usar la validación del límite de solicitudes.
4. Verificar carga de dashboard autenticado, controles de selección y lectura anónima denegada. No cambiar estados de casos reales para realizar pruebas.

Los totales autorizados para solicitudes deben ser números en Firestore. Un registro legado con importe textual requiere revisión administrativa antes de solicitarlo; las reglas rechazan importes que no pueden comparar de forma segura.
El editor local presenta errores de lint preexistentes en otros flujos; el build y las pruebas indicadas son los controles de este paquete.
El parser procesa PDFs con texto incrustado; no incorpora reconocimiento de imágenes escaneadas.
La consola de Storage mostraba “Comenzar” en la revisión: la carga real de comprobantes depende de que ese servicio esté configurado. Las transiciones Firestore se prueban en el emulador; esto no certifica una carga de archivo real.

## Recuperación

Revertir el commit de aplicación si fuera necesario y desplegar esa reversión en Vercel. Mantener cerradas las reglas; no restaurar el antiguo `allow read, write: if true`. Corregir cualquier incompatibilidad de permisos con una regla acotada y pruebas antes de publicarla.

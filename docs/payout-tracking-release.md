# Solicitudes múltiples y trazabilidad de órdenes de pago

## Resultado

Se elimina el límite funcional de cinco casos. El analista puede seleccionar todos sus casos habilitados o los del filtro actual y presentar una sola solicitud. El servicio procesa bloques de 75 casos con cursor persistente; cerrar el navegador no interrumpe el procesamiento.

Cada solicitud nueva recibe un número correlativo anual `SOL-AAAA-000001`. Al aprobarla se reserva una orden `OP-AAAA-000001`. Los números son únicos y nunca se reciclan; una validación fallida puede dejar saltos en la secuencia. Las solicitudes existentes conservan su ID y se muestran como `LEG-ID`, sin inventar fechas ni historial.

## Fuente de verdad y estados

- Solo el servicio con Admin SDK crea/transiciona solicitudes y escribe eventos, numeradores y pagos.
- El analista envía IDs; el servidor verifica perfil activo, pertenencia, IMPAGO en ambos campos, ausencia de otra solicitud y 40 días completos en el calendario de Buenos Aires.
- Los importes se calculan en centavos a partir de la factura principal. El porcentaje de ahorro no se suma como dinero.
- Los casos quedan reservados mientras se valida la creación. Ante un conflicto se liberan las reservas propias y queda una solicitud FAILED con explicación; nunca se presenta como lista para aprobar.
- Estados: PROCESSING → SUBMITTED → APPROVED_WAITING_INVOICE → INVOICE_REVIEW → READY_TO_PAY → PAGO. Si no requiere factura, aprobar lleva a READY_TO_PAY. Rechazar libera los casos y conserva el detalle original.
- Subir la factura no equivale a verificarla. Solo administración la verifica.
- Cualquier operación en curso impide iniciar otra sobre la misma solicitud. Los reintentos utilizan un identificador estable.
- Cada bloque y su cursor se confirman juntos en una transacción. El trigger soporta entregas duplicadas. Los fallos transitorios se reintentan; conflictos en una aplicación ya iniciada quedan BLOCKED para revisión y reanudación por administración.
- Los casos vinculados no pueden cambiar de importe, titularidad ni estado mediante escrituras del navegador. Administración puede seguir actualizando cobros; la sincronización histórica de copias se conserva.

## Datos y búsqueda

Cabecera: número SOL, número OP, analista/UID, fecha del servidor, estado, moneda, cantidad de casos, total en centavos, fecha de aprobación/verificación/rechazo/pago y progreso.

Detalle inmutable en `payoutRequests/{id}/items`: factura, siniestro, aseguradora, fecha de emisión e importe por caso. Historial en `events`: acción, fecha, usuario/rol, estado anterior/siguiente y motivo. El historial antiguo sigue visible.

Búsqueda por número SOL/OP, ID, analista, siniestro, factura y referencia bancaria; filtros de estado y fecha de solicitud. Exportación CSV del detalle con escape de fórmulas. La búsqueda por caso carga los detalles de las solicitudes visibles al escribir; para volúmenes muy grandes debe reemplazarse por un índice de búsqueda paginado.

Pago: fecha efectiva, importe exacto, cuenta de origen y referencia bancaria. El servicio coteja el detalle contra las facturas y el total de la orden. La combinación normalizada cuenta/referencia no puede reutilizarse en otra orden. No es una conciliación bancaria automática: cuenta y referencia son datos declarados por administración. Esta versión registra pagos completos; no introduce pagos parciales ni transferencias reales.

`analystPayments/{requestId}` guarda un único pago vinculado a la solicitud, preparado como fuente del futuro módulo de egresos. No se duplica un egreso por cada caso. El comprobante adjunto en este circuito es la factura del analista, no el comprobante bancario.

## Compatibilidad y límites técnicos

Se mantienen IDs, snapshots e historial de solicitudes anteriores. El servicio puede aprobar, rechazar y pagar solicitudes previas; exige que el detalle original y las facturas sean coherentes. Las órdenes pagadas históricas se consultan sin generar pagos retroactivos.

El límite de cinco desaparece, pero se conserva el límite técnico de tamaño de documentos: la lista de IDs debe ocupar menos de 500 KB. No se almacena todo el detalle en la cabecera. Selecciones mayores requieren otro modelo de carga de IDs antes de admitirse; no se dividen silenciosamente.

## Validación

- `npm test`: unidades y regresiones OCR/estados masivos.
- `npm run test:rules`: reglas más servicio sobre Firestore Emulator; nunca producción.
- Solicitudes de 1, 5, 6, 20, 50, 100 y 300 casos; cursor y recuperación; concurrencia; doble clic; copias inexistentes; conflicto tardío y liberación; referencia bancaria repetida; ciclo de 100 casos; compatibilidad histórica.
- `npm run build` y lint de componentes nuevos.
- Pendiente: validación visual en navegador habilitado y prueba de punta a punta de callable + trigger + Storage en un proyecto Firebase de prueba. Las pruebas locales del servicio ejecutan los pasos del trigger directamente.

## Despliegue coordinado (no fusionar antes de preparar el servicio)

1. Autenticar Firebase CLI con la cuenta del proyecto; verificar facturación/Cloud Functions, región, APIs requeridas y bucket Storage. No guardar claves privadas en Vercel ni en el repositorio.
2. En un proyecto de prueba, instalar `npm ci --prefix functions`, desplegar el codebase `payouts` y las reglas; validar llamadas autenticadas, trigger automático, autorización cruzada y archivo PDF real. Verificar permisos de la cuenta de ejecución de Functions y el acceso de Storage a Firestore para sus reglas.
3. Antes de producción, verificar otras rutas de Storage desplegadas y compatibilizar reglas. Este paquete contempla `payout_receipts` y `liquidations`.
4. Preparar una ventana de actualización: desplegar Functions (`firebase deploy --only functions:payouts --project PROJECT_ID`), luego reglas de Firestore/Storage y el frontend coordinadamente. Las versiones antiguas de la web dejarán de poder enviar operaciones directas y deben recargarse.
5. Confirmar versión de frontend, numeración, búsqueda, creación de más de cinco casos y ciclo completo en el entorno de prueba. No crear pagos ficticios en producción para probar.
6. Monitorear jobs en fases no terminales y errores. No desactivar el servicio ni restaurar reglas anteriores mientras existan jobs activos. Un rollback requiere detener nuevas solicitudes, resolver operaciones pendientes y mantener accesible el historial v2.

La sesión local no tiene una cuenta autorizada de Firebase CLI. El paquete no debe publicarse solo en Vercel: hacerlo sin Functions dejaría indisponible la creación de solicitudes.

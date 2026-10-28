# Solicitudes múltiples y trazabilidad de órdenes de pago

## Resultado

Se elimina el límite funcional de cinco casos. El analista puede seleccionar todos sus casos habilitados o los del filtro actual y presentar una sola solicitud. El servicio procesa bloques de 75 casos con cursor persistente; cerrar el navegador no interrumpe el procesamiento.

Cada solicitud nueva recibe un número correlativo anual `SOL-AAAA-000001`. Al aprobarla se reserva una orden `OP-AAAA-000001`. Los números son únicos y nunca se reciclan; una validación fallida puede dejar saltos en la secuencia. Las solicitudes existentes conservan su ID y se muestran como `LEG-ID`, sin inventar fechas ni historial.

## Fuente de verdad y estados

- Solo el servicio con Admin SDK crea/transiciona solicitudes y escribe eventos, numeradores y pagos.
- El analista envía IDs; el servidor verifica perfil activo, pertenencia, IMPAGO en ambos campos, ausencia de otra solicitud y 40 días completos en el calendario de Buenos Aires.
- Los importes se calculan en centavos a partir de la factura principal. El porcentaje de ahorro no se suma como dinero.
- Los casos quedan reservados mientras se valida la creación. Ante un conflicto se liberan las reservas propias y queda una solicitud FAILED con explicación; nunca se presenta como lista para aprobar.
- Estados: PROCESSING → SUBMITTED → READY_TO_PAY → PAGO. Aprobar siempre lleva directamente a pendiente de pago. Rechazar libera los casos y conserva el detalle original.
- La recepción y validación de factura del analista se realiza externamente por WhatsApp. Se retiran UPLOAD/VERIFY y las nuevas cargas de factura; los adjuntos históricos conservan acceso de lectura.
- Cualquier operación en curso impide iniciar otra sobre la misma solicitud. Los reintentos utilizan un identificador estable.
- Cada bloque y su cursor se confirman juntos en una transacción. El trigger soporta entregas duplicadas. Los fallos transitorios se reintentan; conflictos en una aplicación ya iniciada quedan BLOCKED para revisión y reanudación por administración.
- Los casos vinculados no pueden cambiar de importe, titularidad ni estado mediante escrituras del navegador. Administración puede seguir actualizando cobros; la sincronización histórica de copias se conserva.

## Datos y búsqueda

Cabecera: número SOL, número OP, analista/UID, fecha del servidor, estado, moneda, cantidad de casos, total en centavos, fecha de aprobación/verificación/rechazo/pago y progreso.

Detalle inmutable en `payoutRequests/{id}/items`: factura, siniestro, aseguradora, fecha de emisión e importe por caso. Historial en `events`: acción, fecha, usuario/rol, estado anterior/siguiente y motivo. El historial antiguo sigue visible.

Búsqueda por número SOL/OP, ID, analista, siniestro, factura y referencia bancaria; filtros de estado y fecha de solicitud. Exportación CSV del detalle con escape de fórmulas. La búsqueda por caso carga los detalles de las solicitudes visibles al escribir; para volúmenes muy grandes debe reemplazarse por un índice de búsqueda paginado.

Descarga PDF desde el detalle, tanto para administración como para el analista propietario: encabezado SOL/OP, estado, fechas, total, todos los casos paginados, factura adjunta identificada, datos registrados del pago, historial y referencia interna. Se vuelve a consultar el servidor y se verifica que la cabecera no haya cambiado mientras se obtiene el detalle. No se exporta durante procesamiento, con casos faltantes o importes inconsistentes. El PDF declara su fecha de emisión y no acredita una transferencia bancaria ni sustituye una factura fiscal. Los adjuntos no se incrustan ni se publican URLs privadas. Las solicitudes sin aprobación se titulan Solicitud de pago; las aprobadas, Orden de pago, conservando su estado actual. Se verifica extracción PDF de 300 casos y una muestra renderizada de tres páginas. `node scripts/sample-payout-pdf.mjs` genera una muestra con datos ficticios.

Pago: fecha efectiva, importe exacto, cuenta de origen y referencia bancaria. El servicio coteja el detalle contra las facturas y el total de la orden. La combinación normalizada cuenta/referencia no puede reutilizarse en otra orden. No es una conciliación bancaria automática: cuenta y referencia son datos declarados por administración. Esta versión registra pagos completos; no introduce pagos parciales ni transferencias reales.

`analystPayments/{requestId}` guarda un único pago vinculado a la solicitud, preparado como fuente del futuro módulo de egresos. No se duplica un egreso por cada caso. Cada nuevo pago exige un comprobante bancario PDF/JPG/PNG de hasta 10 MB y confirmación administrativa de cotejo de beneficiario, importe, fecha y referencia. El archivo se guarda en `payment_receipts/{requestId}` y es inmutable. El servidor verifica pertenencia, uploader, tamaño, tipo y firma inicial del archivo; registra generación, SHA-256 y quién/cuándo cotejó el pago. Esto valida el respaldo documental, no la autenticidad ni la acreditación bancaria. Los registros pagados anteriores siguen visibles aunque no tengan adjunto.

## Compatibilidad y límites técnicos

Se mantienen IDs, snapshots e historial de solicitudes anteriores. El servicio puede aprobar, rechazar y pagar solicitudes previas; exige que el detalle original y las facturas sean coherentes. Las órdenes pagadas históricas se consultan sin generar pagos retroactivos.

El límite de cinco desaparece, pero se conserva el límite técnico de tamaño de documentos: la lista de IDs debe ocupar menos de 500 KB. No se almacena todo el detalle en la cabecera. Selecciones mayores requieren otro modelo de carga de IDs antes de admitirse; no se dividen silenciosamente.

## Validación

- `npm test`: unidades y regresiones OCR/estados masivos.
- `npm run test:rules`: reglas más servicio sobre Firestore y Storage Emulator; nunca producción.
- Solicitudes de 1, 5, 6, 20, 50, 100 y 300 casos; cursor y recuperación; concurrencia; doble clic; copias inexistentes; conflicto tardío y liberación; referencia bancaria repetida; ciclo de 100 casos; compatibilidad histórica.
- `npm run build` y lint de componentes nuevos.
- Pendiente: validación visual en navegador habilitado y prueba de punta a punta de callable + trigger + Storage en un proyecto Firebase de prueba. Las pruebas locales del servicio ejecutan los pasos del trigger directamente.

## Despliegue coordinado (no fusionar antes de preparar el servicio)

1. Autenticar Firebase CLI con la cuenta del proyecto; verificar facturación/Cloud Functions, región, APIs requeridas y bucket Storage. No guardar claves privadas en Vercel ni en el repositorio.
2. En un proyecto de prueba, instalar `npm ci --prefix functions`, desplegar el codebase `payouts` y las reglas; validar llamadas autenticadas, trigger automático, autorización cruzada y archivo PDF real. Verificar permisos de la cuenta de ejecución de Functions y el acceso de Storage a Firestore para sus reglas.
3. Antes de producción, verificar otras rutas de Storage desplegadas y compatibilizar reglas. Este paquete contempla `payout_receipts`, `payment_receipts` y `liquidations`.
4. Preparar una ventana de actualización: desplegar Functions (`firebase deploy --only functions:payouts --project PROJECT_ID`), luego reglas de Firestore/Storage y el frontend coordinadamente. Las versiones antiguas de la web dejarán de poder enviar operaciones directas y deben recargarse.
5. Confirmar versión de frontend, numeración, búsqueda, creación de más de cinco casos y ciclo completo en el entorno de prueba. No crear pagos ficticios en producción para probar.
6. Monitorear jobs en fases no terminales y errores. No desactivar el servicio ni restaurar reglas anteriores mientras existan jobs activos. Un rollback requiere detener nuevas solicitudes, resolver operaciones pendientes y mantener accesible el historial v2.

La sesión local no tiene una cuenta autorizada de Firebase CLI. El paquete no debe publicarse solo en Vercel: hacerlo sin Functions dejaría indisponible la creación de solicitudes.

## PDF corporativo y comprobante bancario

El PDF usa el logo original suministrado por Verax, negro y rojo corporativo, tipografía de mayor tamaño y una banda destacada para el total. No muestra el campo moneda ni el circuito de recepción/validación de la factura del analista; los eventos históricos siguen conservados en la base. Muestra los casos completos, identificadores SOL/OP, estado, acciones relevantes y datos del pago con el nombre del comprobante bancario. Los importes se expresan en pesos.

Por decisión del usuario, el circuito de factura se elimina tanto del PDF como de la app. Las reglas históricas requiresInvoice ya no condicionan aprobar ni pagar. Los estados históricos APPROVED_WAITING_INVOICE, NEEDS_INVOICE, PENDIENTE_FACTURA e INVOICE_REVIEW se muestran como pendiente de pago y pueden continuar con comprobante bancario, sin migrar ni borrar su historial. No se admiten pagos desde solicitudes aún no aprobadas.

El formulario permite adjuntar el respaldo y exige cotejo manual antes de confirmar. Si cambia un dato del pago, se debe confirmar el cotejo nuevamente. Un error después de cargar el archivo conserva su referencia para reintentar sin duplicar la carga. La pantalla de detalle permite abrir el comprobante asociado. Archivos cargados y abandonados no generan pagos; no se purgan automáticamente en esta versión.

Validación adicional: firmas de PDF/JPEG/PNG, metadata obtenida por servidor, permisos Storage por rol y orden, inmutabilidad, acceso del analista solo al adjunto confirmado y PDF de 300 casos sin omisiones. Revisión visual del ejemplo de 35 casos en tres páginas. Sigue pendiente la prueba de punta a punta de callable/trigger/Storage en Firebase de prueba y la revisión interactiva en navegador.

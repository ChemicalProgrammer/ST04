# Guardado en Drive desde Apps Script

El auxiliar local se retiró. La aplicación permanece dentro de Apps Script y guarda exclusivamente en la carpeta de Drive configurada por cada usuario. No se requieren terminales, Node.js, una página auxiliar ni Drive para escritorio. No hace falta borrar ni migrar casos existentes. Las preferencias antiguas de almacenamiento local se ignoran.

## Borrador y guardado

Los inputs, resultados, escenarios evaluados e historial de chat permanecen en memoria mientras se trabaja. Basic guarda al pulsar Save. En Advance, el guardado manual es el valor predeterminado para casos nuevos; Autosave sigue disponible si se activa explícitamente. Los casos existentes conservan su elección de Autosave en Settings → Case → Case saving. Desactívalo si quieres guardar solamente con Save. Cerrar o recargar sin guardar puede perder el borrador; la app avisa si hay cambios pendientes. La memoria de la página no es una copia persistente en disco.

Save captura el último borrador, compacta la reproducción cuando es necesario y envía una revisión a Apps Script. Los cambios durante un guardado permanecen pendientes; no hay escrituras simultáneas del mismo editor. La creación de un caso nuevo sigue siendo una operación explícita de guardado. Crear un escenario valida el borrador en Apps Script y agrega una simulación pendiente en el navegador: no guarda previamente el caso ni vuelve a leerlo de Drive.

## Archivos

Cada caso conserva su encabezado y un JSON por simulación. Una simulación modificada actualiza el contenido del mismo archivo de Drive mediante `setContent`; conserva nombre e ID. Se crea un archivo solo para una simulación nueva o para recuperar un archivo ausente. Las simulaciones sin cambios se identifican por SHA-256 y no se descargan ni reescriben. Un guardado sin cambios evita también escribir el encabezado y el índice. Los nombres antiguos siguen siendo compatibles.

El servidor conserva en memoria el contenido anterior de los archivos modificados e intenta restaurarlo si falla una escritura posterior. Drive no proporciona una transacción atómica entre archivos: una interrupción abrupta o un fallo de restauración puede dejar una escritura parcial. Se conservan el bloqueo por usuario y el control de revisión.

Esta versión reduce creación de archivos y operaciones de limpieza; no se ha medido la latencia real de Drive corporativo. El envío todavía incluye el borrador completo del caso; no se afirma que solo viajen los campos modificados.

## Gemini

Gemini recibe los inputs y agregados del borrador desde el navegador. No requiere guardar ni volver a leer el caso de Drive antes de cada pregunta. Se excluyen replay, muestras, eventos e historial duplicado. El historial queda pendiente hasta Save cuando el guardado es manual.

## Actualización de Apps Script

Actualizar juntos: `CaseService.gs`, `ScenarioService.gs`, `ClientCases.html`, `ClientSimulation.html`, `ClientUtils.html`, `LocalDrive.html`, `Main.gs`, `WebApp.html`, `Shell.html`, `DialogStyles.html`, `SheetImport.html`, `UiPreferences.html` y `DemoCaseFactory.gs`. Se conserva el nombre de archivo `LocalDrive.html` para facilitar el despliegue manual; ahora solo contiene `STCaseContext`, el generador de contexto en memoria. Si se parte de una versión anterior al contexto en memoria, incluir también `Assistant.html`, `GeminiService.gs` y `GeminiContext.gs`.

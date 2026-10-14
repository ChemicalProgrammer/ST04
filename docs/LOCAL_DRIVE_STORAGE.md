# Guardado local en la carpeta de Drive

El modo **Local Drive folder** guarda los JSON directamente en la carpeta de Drive para escritorio seleccionada en la computadora. El auxiliar no sube archivos: Drive para escritorio los sincroniza. Guardado local completado no significa subida a la nube completada.

Apps Script sirve la app en un iframe. La selección y escritura de carpetas ocurre en una ventana local de nivel superior, donde Chrome/Edge puede pedir permiso para la carpeta. El auxiliar de Node sirve únicamente tres archivos estáticos en `127.0.0.1:8765`; no recibe rutas absolutas, no lee archivos del caso y no recibe llaves API. La ventana del navegador realiza la escritura con el permiso del usuario.

## Activación

1. Actualiza el repositorio en tu computadora y despliega los módulos de Apps Script modificados. Incluye el nuevo `LocalDrive.html`.
2. Con Drive para escritorio funcionando, abre una terminal en el repositorio y ejecuta `npm run local-drive`. Necesitas Node.js y npm; el auxiliar usa módulos nativos y no requiere instalar dependencias adicionales.
3. Guarda/cierra el caso abierto. En **Settings → Case → Drive workspace**, conserva el ID de la carpeta de Drive configurada y guardada.
4. Pulsa **Connect local Drive folder**. Se abre una ventana local. La app prepara una marca `simuline-workspace.json` en la carpeta de Drive, una sola vez.
5. Espera a que Drive sincronice la marca. En la ventana local pulsa **Select local Drive folder** y selecciona esa misma carpeta dentro de Drive para escritorio. La marca debe coincidir con el ID configurado. No selecciones directamente la subcarpeta `SimulatorTemplate Cases`.
6. Al conectar, la app cambia automáticamente a **Local Drive folder** y lee la galería desde los archivos locales. Mantén abiertos la terminal y la ventana auxiliar. El modo se recuerda por cuenta y carpeta; una sesión nueva requiere volver a conectar el auxiliar y conceder acceso a la carpeta cuando el navegador lo solicite.

El modo **Drive cloud** se conserva como alternativa explícita. En modo local no hay retorno automático a la nube: si el auxiliar no está disponible, el guardado falla y el borrador permanece pendiente. No cambies de modo mientras editas un caso; los controles se deshabilitan hasta cerrar el caso.

## Archivos e identidad

Se conserva la organización `SimulatorTemplate Cases/<id-del-caso>/<id-del-caso>.case.json`, con un JSON por simulación. Los archivos existentes conservan sus nombres, incluso los nombres generados por el modo nube. Las simulaciones nuevas usan `simulation-<id>.json`. Renombrar o modificar una simulación actualiza el contenido del mismo archivo. Solo una simulación nueva crea un archivo nuevo.

Se comparan contenidos para evitar reescribir simulaciones sin cambios. El encabezado del caso mantiene referencias y revisión. La escritura usa `createWritable()` y se confirma al cerrar el flujo; si falla una operación, se intenta restaurar los archivos modificados antes de confirmar el encabezado. Esta recuperación no garantiza una transacción completa frente al cierre abrupto del navegador o la sincronización desde otra computadora.

La revisión detecta cambios presentes en los archivos locales y Web Locks coordina ventanas del mismo navegador. No constituye un bloqueo distribuido entre computadoras. Usa un editor por caso y permite que Drive termine de sincronizar antes de abrirlo en otro equipo. La eliminación confirmada de un caso elimina su carpeta local; Drive sincroniza esa eliminación según su comportamiento habitual.

No se retira ni migra destructivamente ningún caso de la nube al activar este modo. Seleccionar la carpeta sincronizada correcta permite leer sus casos existentes.

## Gemini y otros servicios

Gemini recibe una instantánea del caso y la simulación seleccionada desde la memoria del navegador. Se excluyen reproducción, muestras, eventos, importaciones originales e historial duplicado; los agregados, inputs y evidencia de escenarios se conservan. El contexto se etiqueta `BROWSER_SNAPSHOT`, sin afirmar que esté guardado en la nube. No hay guardado ni lectura de Drive como requisito previo a la pregunta.

La llamada a Gemini y las llaves continúan en Apps Script. Crear casos/demos o preparar escenarios usa las validaciones actuales de Apps Script, pero la persistencia posterior ocurre localmente. Importar o exportar una Google Sheet continúa usando Google Sheets/Drive explícitamente y acepta el contexto del caso local. Editar y guardar un caso ya abierto puede funcionar sin conexión mientras el auxiliar y el permiso sigan disponibles; inicio de sesión, validaciones remotas y Gemini requieren conexión.

## Archivos de Apps Script que se deben actualizar juntos

- `LocalDrive.html` (nuevo)
- `WebApp.html`, `DialogStyles.html`, `Shell.html`
- `ClientCases.html`, `ClientUtils.html`, `Assistant.html`
- `Main.gs`, `ScenarioService.gs`, `GeminiService.gs`, `GeminiContext.gs`
- `SheetImport.html`, `SheetImportService.gs`, `SheetExportService.gs`

El auxiliar vive en `scripts/local-drive.mjs` y `src/local-drive/`; no se copia a Apps Script. El comando está en `package.json`.

## Verificación

Pruebas con archivos reales de un directorio temporal: identidad de nombres, lectura, actualización, conflictos, conservación de simulaciones sin cambios y restauración al fallar una escritura. Pruebas del canal: origen, ventana y token, desconexión sin escritura alternativa en la nube y marca de Drive creada una vez. Pruebas de Gemini: contexto desde memoria sin lectura de Drive y firma de inputs conservada. Se comprobó el arranque HTTP del auxiliar. La selección real de la carpeta, los permisos del navegador y la sincronización de Drive para escritorio deben verificarse en la computadora del usuario; no se han medido en Windows desde este entorno.

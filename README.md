# ST

Aplicación web con Apps Script, almacenamiento en Drive e integración con Gemini.

- Textos de interfaz: `apps-script/TextResources.gs`.
- Colores, tipografía, tamaños y espaciado: `apps-script/DesignTokens.html`.
- Vistas y controladores: módulos en `apps-script/`.
- Reconstrucción desde Gemini Pro (chat): [Gemini](Gemini/README.md).
- Documentación histórica: `docs/`.
- Reconstrucción con Gemini Code Assist: [Visual Code](Visual%20Code/docs/README.md).

`npm run build:apps-script` actualiza los adaptadores del motor (`SimulationEngine.html` y `ScenarioEngine.gs`); requiere Python 3 en la máquina de desarrollo para incluir el paquete SimPy. El despliegue usa todos los módulos `.gs` y `.html` de `apps-script/` y su manifiesto. Si existen `Code.gs` e `Index.html` en un proyecto de Apps Script anterior, elimínalos: ya no forman parte del despliegue. `npm test` ejecuta las pruebas.

En **Advance → Settings → Simulation**, el motor actual permanece por defecto y se puede elegir **DES · Python / SimPy (experimental)** por simulación. Se ejecuta en el navegador con Pyodide, sin Google Cloud, y necesita descargar el runtime por HTTPS la primera vez. El OEE y What-If del prototipo aún no están validados. [Alcance, límites y pruebas](docs/35_BROWSER_SIMPY_ENGINE.md).

En **Line Setup**, cada equipo permite editar **MTBF (min)** y **MTTR (min)** y activar/desactivar **Failures enabled**. Los valores alimentan `noiseProfile.reliability` y se conservan en `processData.equipment`; desactivar fallas conserva los tiempos para volver a activarlas.

**Import JSON**, junto a **Import Sheet**, permite abrir un archivo JSON (hasta 6 MB) o pegar su contenido. **Edit JSON**, en la vista JSON, abre la configuración de la simulación activa. Ambos usan un borrador independiente: **Validate and Apply** valida y actualiza la interfaz; **Cancel** descarta el borrador. Se acepta el formato exportado `st-line-configuration-v1` o un objeto con `equipment` y, opcionalmente, `dynamicConfig`. Se validan la estructura, los identificadores, las reglas físicas y la confiabilidad. Esta interfaz requiere `tickSeconds: 0.25`.

La aplicación conserva la identidad del caso y la simulación, así como las otras simulaciones. La configuración compartida `engineConfig` y la unidad del caso deben coincidir. Aplicar una configuración descarta los resultados anteriores de la simulación activa y activa el guardado automático; los errores de guardado siguen disponibles para reintento.

La lista de casos incluye un botón **Clone case** en cada fila o tarjeta. Crea una copia independiente con sus simulaciones y resultados guardados, sin modificar el caso original. Al actualizar una instalación anterior, elimina también `ReferenceCaseFactory.gs` de Apps Script: ya no forma parte de la aplicación.

**Line Setup → Export JSON** guarda únicamente los parámetros de entrada de la simulación activa. En **Comparisons**, selecciona dos simulaciones y usa **Export** para obtener JSON de ambas configuraciones, resultados guardados y estadísticas de todas las réplicas, o un reporte HTML/PDF. En **What-If**, **Export** ofrece JSON con las propuestas visibles, comprobaciones y evidencia de la simulación seleccionada, además de HTML/PDF. Los JSON de análisis son reportes de datos y no son archivos de configuración para **Import JSON**. Los replays y registros de eventos no forman parte de estos reportes.

En una simulación con varias rondas, cada una usa los mismos eventos programados y una semilla distinta. Durante la ejecución, la primera conserva los frames del intervalo elegido y admite controles de equipo; un control añadido recalcula todas las rondas. Al guardar, el replay de la primera se reduce a un máximo de 600 frames y los de las demás comparten un presupuesto de 600, para limitar el tamaño del caso. Tras cambiar de simulación o recargar, las gráficas se basan en esas muestras guardadas. Las rondas siguientes conservan una reproducción reducida, se reproducen en secuencia o se eligen en el selector **Round**, y sus controles de equipo están desactivados. Los resultados anteriores mantienen el formato en que fueron guardados: vuelve a ejecutar el lote para disponer de replays de todas las rondas.

En **Case Gallery → Settings**, solo aparecen **Appearance**, **Gemini** y **Storage**; **Case** y **Simulation** requieren un caso abierto. En **Advance → Settings → Storage → Factory reset**, **Reset app** limpia la conexión de Drive, llave y configuración de Gemini de la cuenta y preferencias de este navegador, y vuelve al inicio de sesión. Primero cierra el caso y conserva el folder ID. Los archivos, resultados y `cases-index-<email>.json` de Drive permanecen: inicia sesión con la misma cuenta y vuelve a introducir el mismo folder ID para recuperar los casos. El modo vuelve al valor predeterminado del despliegue; no se alteran las propiedades globales ni otras cuentas.

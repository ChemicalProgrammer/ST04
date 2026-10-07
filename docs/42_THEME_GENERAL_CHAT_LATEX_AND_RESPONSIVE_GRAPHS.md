# Tema, consultas generales, LaTeX y gráficas adaptables

## Cambios

- La selección de texto usa `--accent` y `--on-accent`, siguiendo la paleta y el tema claro/oscuro activos.
- Basic oculta la sección **Add maintenance, retrofit or replacement target**. Advance conserva la entrada de intervenciones. Los objetivos previamente guardados no se borran.
- Gemini muestra fórmulas con KaTeX 0.19.0 integrado localmente y salida MathML nativa: `\(…\)`, `\[…\]`, `$…$` y `$$…$$`. La protección de fórmulas ocurre antes del Markdown, para que sus barras, subíndices y símbolos no se interpreten como formato de texto. Los bloques de código no se transforman. Las fórmulas incompletas durante la aparición progresiva o inválidas permanecen como texto, sin interrumpir el chat. Los mensajes copiados conservan el LaTeX original.
- La V-Graph ocupa el ancho disponible, sin ancho mínimo extendido ni barra horizontal. ResizeObserver y un respaldo de resize redibujan el gráfico. En espacios estrechos se inclinan y abrevian nombres; los nombres completos y valores se conservan en tooltips. Los valores numéricos encima de puntos se ocultan cuando el espacio no permite leerlos. Las gráficas canvas existentes ya calculan su ancho a partir del contenedor.
- La bienvenida aumenta el nombre a 28–34 px, el distintivo a 64 px y el SVG a 44 px, sin cambiar el tamaño de la marca del panel lateral.

## Preguntas generales y preguntas del caso

El selector **Question context** del chat ofrece:

| Opción | Guardado/contexto |
| --- | --- |
| Current simulation | Conserva el flujo existente: utiliza el caso y la simulación guardados. Con guardado manual y cambios pendientes pide Save antes de consultar. |
| General question · no case data | Envía la pregunta, instrucciones de uso y conversación general; no lee el archivo Drive ni envía equipos, resultados o nombre del equipo seleccionado. No fuerza guardar el caso ni permite propuestas accionables. |

En el catálogo, sin caso abierto, Gemini se puede abrir para consultas generales si está configurada la llave del usuario. Esa conversación es temporal y se descarta al abrir un caso. Al abrir un caso, el selector empieza en Current simulation; para preguntar con cambios sin guardar, elegir General question.

Con un caso abierto, los mensajes generales se conservan en el borrador del historial de la simulación. Save o el autosave habitual de Advance los guardan; la respuesta no obliga a guardar ni bloquea por cambios pendientes. Cada mensaje conserva `scope: CASE | GENERAL`. Los mensajes históricos sin ese campo se consideran CASE. La consulta general no reutiliza el historial del caso como contexto. Editar/regenerar respeta el contexto original de la pregunta y mantiene el comportamiento de reemplazar la rama posterior.

## Renderizado local de fórmulas

`apps-script/KaTeX.html` contiene la distribución minificada de KaTeX 0.19.0, procedente del paquete npm oficial, y su licencia MIT. Usa MathML del navegador para no necesitar fuentes ni recursos externos. No añade servicios, scopes, Google Cloud ni descargas de CDN en ejecución. Las fórmulas se procesan con `trust:false`, límites de expansión/tamaño y macros nuevos por fórmula; los comandos inválidos o no admitidos se muestran como texto. El HTML del modelo sigue sin ejecutarse.

Documentación del proyecto: https://katex.org/docs/options y https://katex.org/docs/autorender .
SHA-256 del módulo integrado: `3985cb48698baf526e3f060299e7674c1a436e483c26ef35942b3df950badb09`.

## Verificación enfocada

- 39 pruebas de Markdown/MathML, peticiones Gemini y ensamble de módulos aprobaron.
- Persistencia real de historial mediante los servicios del proyecto: conserva GENERAL y la compatibilidad CASE histórica.
- Pruebas de interfaz: pregunta general sin caso; consulta general con cambios no guardados sin llamar saveCase; consulta del caso bloqueada hasta guardar; guardado posterior del historial; ocultamiento de intervenciones Basic; V-Graph a 320 px; marca de bienvenida a 64 px.
- Regresión de historial en Basic/Advance: copiar, editar, regenerar y cambiar de simulación/caso.
- Regresión de Markdown progresivo y tarjetas Advance.

No se ejecutó toda la suite. Las pruebas usan DOM local y transporte Gemini simulado; confirmar la presentación visual final y la API real tras publicar el despliegue Apps Script.

## Archivos que actualizar en Apps Script

Nuevo:

- `apps-script/KaTeX.html`

Modificados:

- `apps-script/AnalysisStyles.html`
- `apps-script/ApplicationGuide.gs`
- `apps-script/Assistant.html`
- `apps-script/AssistantStyles.html`
- `apps-script/CaseService.gs`
- `apps-script/Client.html`
- `apps-script/GeminiService.gs`
- `apps-script/LinePerformance.html`
- `apps-script/Markdown.html`
- `apps-script/ScenarioExplorer.html`
- `apps-script/Shell.html`
- `apps-script/ShellStyles.html`
- `apps-script/Styles.html`
- `apps-script/WebApp.html`

Actualizar la copia del repositorio, ejecutar `clasp push` y crear una nueva versión del despliegue. El manifest y el motor de simulación no cambian en esta entrega. La inclusión de KaTeX debe existir antes de publicar la versión.

Otros archivos modificados:

- `test/CaseEditorContract.test.js`
- `test/GeminiService.test.js`
- `test/Interface.test.js`
- `test/Markdown.test.js`
- `test/ModularAppsScript.test.js`
- `docs/42_THEME_GENERAL_CHAT_LATEX_AND_RESPONSIVE_GRAPHS.md` (nuevo; este documento)

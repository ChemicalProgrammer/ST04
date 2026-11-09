# Guía de interfaz de SimuLine

Esta guía aplica a las pantallas, diálogos y gráficas de Apps Script, en Basic y Advance. Antes de crear un control, busca un componente equivalente. Usa [DesignTokens.html](../apps-script/DesignTokens.html) para los valores compartidos, [UiStandards.html](../apps-script/UiStandards.html) para las reglas transversales y el módulo de estilos de cada pantalla para su distribución.

## Tipografía

La escala objetivo tiene **cinco tamaños**. Los valores están expresados en `rem`, con equivalencia en píxeles para una raíz de 16 px al 100 %. El tamaño normal ocupa el centro. Básico y avanzado usan los mismos niveles. La preferencia de escala se aplica una sola vez en la raíz del documento.

| Nivel | Tamaño base | Uso |
| --- | --- | --- |
| 1 | 11 px · 0.6875 rem | Pies, marcas secundarias y leyendas compactas |
| 2 | 12 px · 0.75 rem | Ayuda, notas y etiquetas secundarias |
| 3 · Normal | 14 px · 0.875 rem | Cuerpo, etiquetas, botones, inputs y celdas |
| 4 | 18 px · 1.125 rem | Subtítulos, encabezados de tarjetas y títulos de diálogo |
| 5 | 24 px · 1.5 rem | Título principal y cifras KPI destacadas |

Usa `--font-ui` en la interfaz y `--font-mono` para código o JSON. Distingue jerarquías del mismo tamaño con peso, color semántico o posición. Usa 400 para cuerpo, 500 para controles, 600 para encabezados y 700 para énfasis. Usa interlineado 1.5 para texto y 1.25 para títulos. Alinea valores numéricos a la derecha y usa cifras tabulares. Los alias por rol pueden compartir nivel. Toda migración debe mapear el componente a estos cinco niveles sin añadir tamaños locales.

## Espaciado

| Relación | Espacio base | Aplicación |
| --- | --- | --- |
| Entre secciones principales | 24 px · `--space-6` | Un único `gap` o margen lógico del contenedor |
| Entre subsecciones | 16 px · `--space-4` | Aplica también entre una tabla y el siguiente bloque |
| Encabezado a contenido | 12 px · `--space-3` | Dentro de una misma sección |
| Entre controles del mismo grupo | 12 px · `--space-3` | Filas y grillas |
| Etiqueta a campo o checkbox | 8 px · `--space-2` | Controles verticales o en línea |
| Icono y texto estrechamente relacionados | 4 px · `--space-1` | Elementos compactos |
| Interior de tarjeta o panel | 20 px · `--space-5` | 12 px en pantallas estrechas |
| Interior de diálogos | 20 px · `--space-5` | 12 px en pantallas estrechas |
| Celda de tabla | 8 px vertical · 12 px horizontal | Usa un contenedor con desplazamiento para tablas anchas |
| Margen lateral de página | 24 px · `--space-6` | 12 px en pantallas estrechas |

Prefiere `gap` en grillas y contenedores flexibles. Usa márgenes lógicos para bloques independientes y padding para interiores. Quita márgenes duplicados del primer y último hijo cuando el contenedor ya aporta espacio. Un bloque oculto o vacío debe ceder su espacio. Reutiliza la altura de controles, los radios y los bordes del sistema.

## Color y estados

- Usa `--page`, `--surface` y `--surface-soft` para superficies, `--ink` y `--muted` para texto y `--line` para bordes.
- Usa `--accent` con `--on-accent` para acciones principales y los tokens de selección y foco para estados interactivos. Los colores por defecto son **boat blues** y **astronomicon grey**. Las paletas elegidas por el usuario tienen prioridad. [Paletas](../apps-script/ThemeResources.html)
- Usa los tokens de estado para éxito, advertencia, error y estados de equipos. Acompaña el color con texto o icono. Para gráficas, usa `--series-*`, `--chart-grid` y `--chart-axis`. Revisa contraste, foco y legibilidad en claro y oscuro.
- Conserva colores literales en las definiciones de paletas, recursos de marca y exportables autónomos que necesitan declarar su propia paleta.

## Comentarios del código

- Documenta cada función que se agregue o modifique con un comentario en español que explique su propósito. Indica entradas, unidades, salida y efectos laterales cuando no sean evidentes. Documenta también errores, condiciones de carrera o supuestos que afecten el resultado.
- Aplica el mismo criterio a los callbacks que tengan lógica propia. Para callbacks cortos que solo delegan, describe el propósito del bloque que los registra.
- Delimita las secciones funcionales de HTML con comentarios en español. Indica qué controlador llena un contenedor vacío si resulta útil para encontrar su implementación.
- En archivos generados, documenta el código fuente y regenera la salida. En Apps Script usa comentarios HTML en el marcado y comentarios JavaScript dentro de los scripts. Actualiza comentarios junto con el comportamiento que describen.

## Auditoría inicial

| Prioridad | Hallazgo | Acción |
| --- | --- | --- |
| Alta | [DesignTokens.html](../apps-script/DesignTokens.html) define siete tamaños base distintos, de 11 a 24 px, contando KPI. La guía previa enumeraba seis. Una revisión estática de 19 módulos de estilos encontró 192 declaraciones de tamaño, 11 literales directos y 10 valores literales distintos. | Migrar los tokens y alias a los cinco niveles y revisar primero los overrides de Assistant, BrandConveyor y UiStandards. Estos conteos son del código fuente y no equivalen a tamaños computados en pantalla. |
| Alta | [Results.html](../apps-script/Results.html) inserta impacto, atribución, balance por equipo y rampas bajo el mismo contenedor. Sus encabezados no comparten una separación explícita. | Primera corrección en UiStandards. Aplicar el espaciado de subsección a los títulos y bloques de Rate Loss. |
| Alta | Los checkboxes de Rate Loss en Settings estaban en una grilla cuyos estilos generales también afectan a las etiquetas de campos. | Primera corrección en WebApp. Reutilizar la grilla de interruptores que alinea checkbox y etiqueta. |
| Media | [RealDataStyles.html](../apps-script/RealDataStyles.html) aplica 16 px a bloques y paneles y 12 px a grillas. | Revisar el límite entre sección y subsección, y migrar el padding de panel a la regla compartida al ajustar esta vista. |
| Media | [RunOptions.html](../apps-script/RunOptions.html) tenía funciones sin documentación en español y [RealDataPanel.html](../apps-script/RealDataPanel.html) no señalaba sus bloques principales. | Documentados en esta primera pasada. Continuar por Simulación, Resultados, Real Data y Settings. |

Antes de cerrar una migración, revisa Basic y Advance en claro y oscuro, una ventana estrecha, escala al 125 %, controles con foco y estados vacíos, cargados y colapsados. Para cambios de espaciado, comprueba que la separación venga de una sola regla y que los contenedores ocultos cedan su espacio. La auditoría inicial fue estática. Falta verificar visualmente la aplicación desplegada.

## Notas históricas de la interfaz

Estas notas conservan decisiones de comportamiento y distribución anteriores. Para tamaños, colores y espacios de cambios nuevos, aplica las reglas de esta guía.

Views start with subsection headings; the header navigation identifies the main
section. Subsection controls align right. Equipment and Conveyors share one file
menu (Google Sheet / JSON import); Equipment has a separate icon button for JSON export. JSON field actions
use labeled icon buttons. V-Graph uses its speed-profile heading. Main header gaps are 16px;
panel padding is 20px (12px on small screens). Checkboxes remain 16px.

Basic simulation settings use separate efficiency and control boxes with prominent
percentages. Navigation moves the existing controls, preserving listeners and run
locks. Conveyor worksheets grow with their content and use the page scrollbar.

Basic What-If cards show evaluated OEE, throughput and changes from the matching
baseline; Advance retains the detailed comparison table. Both presentations use
the same evaluation, independent validation and creation gate. No ROI or production
estimates are fabricated. Design checks and Results suggestions are Advance-only.
Warning and analysis panels share padding, borders and typography, preserving
severity colors. Accent names remain available through swatch tooltips only.

Verification: modular Apps Script and Settings contracts, targeted jsdom tests for
JSON import isolation, conveyor worksheets, scenario rejection/stop controls,
subsection navigation and mode font scaling. Real-browser visual review is still
needed on the deployed Apps Script page.

Basic CAPEX overview: Current, Zero, Medium, High in a single four-column row.
The current card reads the saved result (batch means when available), has no
calculation actions and displays a dash when no result exists. Narrow containers
scroll horizontally instead of wrapping the four cards. Advance retains its
existing detailed categories, including All CAPEX. File-menu summaries and icon
buttons share dimensions and have no extra bottom margin; subsection headings
share typography, minimum height and spacing.

Basic scenario cards hide technical status/progress paragraphs and show an
indeterminate progress bar only while evaluating or validating. The OEE delta is
labeled in percentage points, not relative percent. Error diagnostics remain in
the header, and required engineering acknowledgements remain available. Medium
CAPEX uses the semantic info color, including cards with no eligible targets.
Export triggers use an upward arrow; Import uses a downward arrow and text-only
menu choices. Conveyor cards hide their unused Basic data container.

Comparison appears after What-If in Advance navigation only. Basic omits the
Comparison utility. Gallery account email is untruncated and Settings/Sign out
use labeled icons. Settings removes category titles already named in the tabs;
the Case name field spans the content width.

Simulation: Basic aligns Run simulation with Simulation settings. Run controls
is no longer displayed. Playback actions are icons, and the right-aligned percent
uses displayed virtual time / configured duration, clamped to 0–100%, preserving
streaming playback and pause/reset behavior. Background replication has its own
progress indicator. Scenario activity is a 9px themed animated bar; all four Basic
cards share the lateral border and a padded title background.

Results export offers JSON (the existing bounded AI summary), HTML and PDF. Full
replay JSON export is removed from that menu. Native result storage is unchanged.
Basic presents generic units; Advance displays the specified flow unit. New demo
cases use units. Import dropdown options share the same menu style as exports.

What-If mode changes rebuild the view immediately. Evaluation keys and saved
controls include the originating Basic/Advance mode so selections and metrics
restore independently. Legacy evaluations without a mode can be adopted by the
first mode that saves them; no old record is deleted. Basic keeps Current/Zero/
Medium/High and colors the lateral borders green/blue/violet by CAPEX tier.
Individual hypotheses are removed from both modes; category searches remain.

Scenario configuration uses one adjustable-parameter table. DOE adds selection,
Low and High columns to each eligible row (maximum four factors), shown when DOE
is enabled. Units appear in one column; parameter labels omit the duplicate unit
suffix. Physical limits and DOE range validation are unchanged. Settings groups
JSON fields and Include DOE checkboxes without a repeated title; Appearance uses
adjacent label/control columns instead of opposite edges of the dialog.

# Real Data: espacio de comparación reprogramado

La interfaz tiene cuatro bloques. No se añaden paneles a la implementación anterior: RealData.html es un controlador nuevo y RealDataModel.html construye un solo objeto de comparación para pantalla, JSON y reporte HTML.

## 1. Registro

Una entrada por dato. Identificación, tiempos, producción/calidad, porcentajes reportados y mediciones por equipo se organizan en grupos desplegables. Se capturan minutos de falla propia, número de fallas, exposición, tiempo operativo, MTBF y MTTR reportados.

Los tiempos se capturan en un árbol colapsable con el input Total Time en el encabezado principal:

- Total Time contiene Business / External Downtime y Plant Available Time.
- Business / External Downtime suma Production Day Losses, Non-Production Days, Outside Sources y Holidays.
- Plant Available Time contiene Plant Decision Downtime y Production Available Time.
- Plant Decision Downtime suma Planned Maintenance, Changeovers, Cleanout / Sanitation, Planned Meetings / Training, Breaks / Lunch y Plant Experimentation / Plant Shutdown.
- Production Available Time contiene Unplanned Downtime y Runtime.
- Unplanned Downtime suma Unscheduled Maintenance, Process Shortages, Labor Shortages y Plant Operations.
- Runtime contiene Runtime Losses y Effective Runtime. Effective Runtime es una fila fija de resultado, sin desplegable propio.
- Runtime Losses suma Production Rate Losses, Scrap y Rework. Scrap y Rework admiten sus minutos equivalentes o su conversión desde botellas y velocidad estándar.

Cada encabezado muestra minutos y una fórmula explicada en español. El mismo patrón de checkbox y valor usado en conveyors permite elegir entrada manual (marcado) o salida calculada (desmarcado). El valor manual se conserva al cambiar a calculado, y el desglose se conserva al cambiar a manual. El total manual sustituye al calculado; nunca se suma a su propio desglose. En modo manual, los inputs que alimentan directamente ese total quedan inactivos. Los subniveles independientes y las mediciones por equipo siguen disponibles. Los balances manuales que no concuerdan con sus conceptos generan un aviso. Plant Available Time = Total Time − Business / External Downtime; Production Available Time = Plant Available Time − Plant Decision Downtime; Runtime = Production Available Time − Unplanned Downtime; Effective Runtime del árbol = Runtime − Runtime Losses. El ajuste calibrado conserva su fórmula específica ya acordada, sin deducir Scrap o Rework.

Los valores nuevos se guardan en timeBreakdown (segundos), con grupos external, decision y unplanned. Los tiempos nuevos parten de 0 y un input de tiempo vacío cuenta como 0. Se retiró el botón de completar ceros. Los registros nuevos y el template incluyen los ceros; los datos históricos originales permanecen conservados, incluidas las cantidades de calidad que pueden convertirse a minutos. Un tiempo total del período de 0 es válido como borrador, pero no permite calcular porcentajes que requieran un denominador positivo.

Los modos y valores manuales se guardan en timeOverrides, por sección: external, plant, decision, production, unplanned, runtime y losses. Cada entrada contiene enabled y valueSeconds. Si un registro antiguo contiene un total positivo sin desglose, se muestra en modo manual para no perderlo. Al desmarcar el checkbox se usa la suma de conceptos, considerando vacíos como cero. La importación/exportación conserva modos, totales y desgloses. El reporte HTML identifica los valores manuales.

Total Time contiene Business / External Downtime y Plant Available Time en una columna. Dentro de Plant Available Time, Plant Decision Downtime y Production Available Time usan dos columnas cuando caben y se apilan en pantallas estrechas. Identificación, Producción y calidad e Indicadores reportados tienen el mismo marco que Total Time. No se muestra el cuadro general de notas; las notas antiguas se conservan en los registros.

El registro de downtime y confiabilidad por equipo se encuentra dentro de Unplanned Downtime → Unscheduled Maintenance. Los minutos por equipo pueden solaparse y no se suman automáticamente al paro exclusivo de línea. La posición agrupa el detalle de fallas y no cambia la definición de ese total. El árbol sigue capturando una sola vez los minutos de Rate Loss, Scrap y Rework; no se reintroducen los campos duplicados ni la sección sin desglose.


La edición actualiza los cálculos en el evento input sin reconstruir los controles. Se preservan el foco, el texto decimal y la selección. No se ejecuta el motor ni se modifica su configuración. Los datos reales siguen perteneciendo al caso.

## 2. Comparación

Los parámetros se agrupan en siete apartados colapsables: calendario y disponibilidad de planta; paradas planificadas y tiempo disponible para producción; paradas no planificadas y tiempo de marcha; pérdidas durante la marcha y tiempo efectivo; producción; parámetros de referencia; indicadores de desempeño. Cada apartado conserva las columnas parámetro, unidad, real, simulado y diferencia. El estado abierto/cerrado se mantiene al editar inputs y cambiar el filtro. Las etiquetas y tooltips visibles usan nombres completos, sin códigos T1–T5 ni la sigla del modelo; los identificadores internos y cálculos permanecen compatibles. El reporte HTML usa los mismos apartados. Un filtro opcional oculta únicamente las filas sin datos. Las fórmulas y su origen están en tooltips, sin columnas de explicación permanentes.

Se centraliza la definición del tiempo efectivo: producción conforme / Standard Rate tiene prioridad; después se usa Runtime menos todas las pérdidas conocidas. Para registros antiguos, el tiempo efectivo reportado o Runtime − Rate Loss sirve como alternativa provisional respecto a calidad, con aviso. Los valores reportados de AU, UPDT y eficiencia Opera se conservan y se muestran como referencia junto al indicador. Si no puede calcularse un indicador, puede mostrarse su valor reportado identificado como tal.

El OEE global guardado mantiene su denominador propio y no se renombra AU u OE. Las advertencias no ocultan una resta cuyos operandos existen.

## 3. Ajuste calibrado de rate loss

La sección reproduce la hoja horizontal A–N: Line, Date, Runtime, Production Available Time, Unplanned Downtime, Production Rate Losses, Effective Run Time, OEE (Opera), Rate Loss, OEE Simulador, Rate Loss Simulado, Rate Loss Opera − Simulador, OEE Calibrado y OEE Simulador Calibrado − OEE Opera. Mantiene los encabezados azules, sin fila de letras ni resaltado verde; dispone de desplazamiento horizontal y tooltips en español. La exportación HTML utiliza la misma tabla. Runtime conserva el dato reportado; no se sustituye por el tiempo calendario. Solo en esta sección, Effective Runtime = Production Available Time − Unplanned Downtime − Production Rate Losses. Los tres operandos deben estar disponibles; si falta uno se muestra pendiente. Runtime reportado, Scrap y Rework no intervienen en este balance. El OEE Opera explícito permanece como referencia; solo su alternativa calculada depende del tiempo efectivo. La comparación general conserva la conciliación AEM y advierte discrepancias.

La fórmula sigue siendo ajustada = simulada − (rate loss real − rate loss simulado); residual = ajustada − eficiencia Opera reportada o calculada. Es un ajuste aritmético de referencia: no cambia el motor ni acredita validez predictiva. K utiliza siempre rate loss bruto simulado / Production Available Time simulado × 100. La selección bruto/neto permanece únicamente en la comparación general. I = F / D × 100; L = I − K; M = J − L; N = M − H. Las diferencias L y N están en puntos porcentuales aunque el encabezado conserva [%] como la hoja. Se calcula con precisión completa antes de redondear; los números de la imagen no se fijan en el código. La calidad desconocida no se considera cero automáticamente.

## 4. Downtime por fallas de equipos

Minutos reales, simulados y diferencia; participación real y simulada en la suma de minutos; e indisponibilidad real/teórica de MTBF/MTTR.

- Minutos simulados: contador failureSeconds / 60, no una proyección obtenida aplicando disponibilidad al calendario.
- Participación: minutos del equipo / suma de minutos de equipos × 100.
- Indisponibilidad MTBF/MTTR: MTTR / (MTBF + MTTR) × 100.
- Real: los contadores de exposición/fallas tienen prioridad para estimar MTBF/MTTR; se conservan los indicadores reportados.
- Simulado teórico: usa los parámetros MTBF/MTTR de la firma guardada de equipos y se distingue de la duración observada en la corrida. Si no existe una firma recuperable se usan los inputs actuales con aviso.
- Los totales incluyen fallas simultáneas y no equivalen a downtime exclusivo de la línea. Un total incompleto permanece pendiente, mostrando el subtotal conocido.
- Un downtime antiguo de clase UNKNOWN, MINOR o ALL no se interpreta como falla propia solo por tener minutos. Se conserva su valor y clasificación.
- Los transportadores sin fallas propias se excluyen de este desglose salvo excepción configurada o un registro real explícito de falla.

## Compatibilidad y módulos

Se conserva el almacenamiento st-real-data-v1, IDs, notas, fuente, snapshots y observaciones existentes. Se importan templates y reportes v1/v2. El JSON de comparación usa st-real-comparison-v2. Las migraciones no borran ni sobrescriben resultados de simulación.

AemComparison.html contiene las fórmulas AEM, RealDataModel.html normalización, snapshot y cálculo canónico, RealData.html interacción y representación, RealDataPanel.html los cuatro bloques, RealDataStyles.html los estilos. WebApp.html carga AemComparison, RealDataModel y RealData en ese orden. No hay cambios en el motor.

Las pruebas verifican importación histórica y de Sheets, conservación de resultados/eventos, promedios y rondas, calidad, recálculo en vivo, foco, fórmulas compartidas con exportación y la distinción entre porcentajes de participación e indisponibilidad.

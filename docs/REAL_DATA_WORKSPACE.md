# Real Data: espacio de comparación reprogramado

La interfaz tiene cuatro bloques. No se añaden paneles a la implementación anterior: RealData.html es un controlador nuevo y RealDataModel.html construye un solo objeto de comparación para pantalla, JSON y reporte HTML.

## 1. Registro

Una entrada por dato. Identificación, tiempos, producción/calidad, porcentajes reportados y mediciones por equipo se organizan en grupos desplegables. Se capturan minutos de falla propia, número de fallas, exposición, tiempo operativo, MTBF y MTTR reportados.

La edición actualiza los cálculos en el evento input sin reconstruir los controles. Se preservan el foco, el texto decimal y la selección. No se ejecuta el motor ni se modifica su configuración. Los datos reales siguen perteneciendo al caso.

## 2. Comparación

Una tabla: parámetro, unidad, real, simulado y diferencia. Incluye tiempos, producción, inputs e indicadores. Un filtro opcional oculta únicamente las filas sin datos. Las fórmulas y su origen están en tooltips, sin columnas de explicación permanentes.

Se centraliza la definición del tiempo efectivo: producción conforme / Standard Rate tiene prioridad; después se usa Runtime menos todas las pérdidas conocidas. Para registros antiguos, el tiempo efectivo reportado o Runtime − Rate Loss sirve como alternativa provisional respecto a calidad, con aviso. Los valores reportados de AU, UPDT y eficiencia Opera se conservan y se muestran como referencia junto al indicador. Si no puede calcularse un indicador, puede mostrarse su valor reportado identificado como tal.

El OEE global guardado mantiene su denominador propio y no se renombra AU u OE. Las advertencias no ocultan una resta cuyos operandos existen.

## 3. Ajuste calibrado de rate loss

La sección reproduce la hoja horizontal A–N: Line, Date, Runtime, Production Available Time, Unplanned Downtime, Production Rate Losses, Effective Run Time, OEE (Opera), Rate Loss, OEE Simulador, Rate Loss Simulado, Rate Loss Opera − Simulador, OEE Calibrado y OEE Simulador Calibrado − OEE Opera. Mantiene los encabezados azules y resalta G, I, L, M y N en verde; dispone de desplazamiento horizontal y tooltips en español. La exportación HTML utiliza la misma tabla. Runtime (C) conserva el dato reportado; no se sustituye por el tiempo calendario.

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

# Validación por OEE y rate loss

La sección de Real Data reproduce los indicadores A–N de la tabla de validación. Sus porcentajes usan Production Available Time; AU permanece separado.

| Columna | Indicador | Regla |
|---|---|---|
| A | Línea | Identificación del registro |
| B | Fecha | Fecha del registro |
| C | Duración del período | Tiempo total observado |
| D | Production Available Time | Dato ingresado o Plant Available − Plant Decision |
| E | Unplanned Downtime | Downtime de línea ingresado; no suma por equipo |
| F | Production Rate Losses | Minutos equivalentes ingresados |
| G | Effective Run Time | D − E − F |
| H | OEE Opera | Reportado independiente de AU; si está vacío, G / D |
| I | Rate Loss Opera | F / D |
| J | OEE Simulador normalizado | Tiempo equivalente de producción / Production Available Time simulado |
| K | Rate Loss Simulado | Pérdida simulada / Production Available Time simulado |
| L | Diferencia de rate loss | I − K, en puntos porcentuales |
| M | OEE ajustado | J − L |
| N | Diferencia residual | M − H, en puntos porcentuales |

Las razones se multiplican por 100 al representarlas como números porcentuales en la aplicación. En una hoja con formato de porcentaje basta F / D.

Los tiempos existentes se reutilizan, sin volver a capturarlos. El registro guarda opcionalmente validation.line, validation.reportedOeePercent y validation.rateLossBasis (UNCONFIRMED, GROSS o NET). La fecha reutiliza date. El OEE reportado nunca reemplaza reportedEfficiencyPercent (AU).

El cálculo usa los resultados de la ronda o promedio seleccionado. No mezcla el denominador total del OEE global con el tiempo disponible de producción. Las exclusiones de calendario requieren el período físico completo ya usado por Real Data. Las diferencias de período, unidades, referencia explícita o entradas guardadas impiden calcular el ajuste. Los datos ausentes permanecen desconocidos; cero se conserva.

K bruto requiere contadores identificados de pérdida bruta. K neto usa el balance neto guardado y puede ser negativo. Con definición de planta pendiente, la sección muestra el cálculo bruto como provisional. La recuperación se conserva separada; no implica una corrección automática de los datos. Las diferencias de calidad o referencias pendientes requieren revisión.

M es un ajuste aritmético estimado: no modifica el motor ni valida por sí solo su capacidad predictiva. Los resultados fuera de 0–100 % se señalan sin recortarlos. La sección se incorpora al JSON de comparación y al reporte HTML.

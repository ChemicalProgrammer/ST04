# Comparación AEM en Real Data

La sección reutiliza los conceptos de las fotografías aportadas y el [compendio AEM](AEM_CONCEPTS_FORMULAS.md). Se mantiene separada de la validación aritmética A–N y de AU reportado.

- T1: período calendario total.
- T2 = T1 − Business / External Downtime.
- T3 = T2 − Plant Decision Downtime.
- T4 (Runtime) = T3 − Unplanned Downtime.
- T5 (Effective Runtime) = producción conforme / Standard Rate.
- Alternativa T5 = T4 − Rate Loss − Scrap − Rework, solo si las tres pérdidas se conocen.
- Rate Loss despejado = T4 − T5 − Scrap − Rework.
- Scrap o Rework equivalentes = unidades afectadas / Standard Rate en unidades/minuto.
- AE = 100 × T5/T1; AU = 100 × T5/T2; OE = 100 × T5/T3; RTE = 100 × T5/T4.
- UPDT (%) = 100 × Unplanned Downtime / (Runtime + Unplanned Downtime), equivalente a UPDT/T3 si los tiempos reconcilian.
- MTBF medido = tiempo operativo interno / número de fallas.
- MTTR medido = tiempo interno de falla / número de fallas.
- Disponibilidad interna (%) = 100 × MTBF/(MTBF + MTTR). La fórmula fraccional requiere multiplicar por 100 para expresarse como porcentaje.

Los datos adicionales se guardan en aem.goodOutputUnits, scrapUnits, reworkUnits, scrapSeconds y reworkSeconds. La velocidad utiliza referenceSpeedBpm. El tiempo operativo por equipo se guarda en equipment[].operatingSeconds; los demás campos de confiabilidad ya existían. Los campos se incluyen en el template JSON, la comparación JSON y el reporte HTML.

Si se capturan minutos y unidades de Scrap/Rework, los minutos tienen prioridad. No se supone cero para pérdidas reales desconocidas. Si existen producción conforme y velocidad estándar, T5 se calcula con esos datos y se advierte si no reconcilia con las pérdidas. Los tiempos originales no se sobrescriben.

En simulación continua, Scrap y Rework son cero por hipótesis de calidad del 100 %, no porque se haya demostrado calidad perfecta en planta. Se muestran aparte pérdida bruta y balance neto; la descarga de acumuladores puede originar recuperación. Los formatos múltiples integran sus referencias sin convertir por una media global.

Runtime de PLC y tiempo de flujo positivo en salida son mediciones distintas: su compatibilidad requiere revisión. OE no se renombra OEE porque el tratamiento de setup puede cambiar el denominador. Los equipos conservan sus tiempos simultáneos; no se suman como downtime exclusivo de línea.

La confiabilidad medida usa los contadores de exposición y fallas de la vista seleccionada. En lotes usa una razón de totales agregados (no el promedio de razones por ronda). Los MTBF/MTTR reportados son respaldo cuando no hay contadores reales completos; se distinguen de las entradas configuradas en simulación. Cero fallas no produce un MTBF infinito ni disponibilidad medida del 100 %. Las fallas cortadas por el horizonte pueden sesgar el MTTR.

El criterio de microparos de 3–4 minutos es una población de datos de diseño, no un filtro automático del motor. La comparación requiere iguales clases de paro y exposición. No se recortan las duraciones simuladas ni se modifican las hipótesis de confiabilidad de conveyors.

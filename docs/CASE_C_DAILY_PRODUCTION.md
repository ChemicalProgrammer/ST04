# Caso C — Registro de un día de producción

Registro recibido el 16 de octubre de 2026 para una comparación posterior con una simulación. Año mostrado en las capturas: **2025**. Las capturas iniciales no muestran la fecha exacta. Una captura adicional de MTBF/MTTR indica **2025-11-03 (3 de noviembre de 2025)**; falta confirmar que las capturas iniciales utilizan ese mismo filtro.

Este registro corresponde a un horizonte de **1,440 minutos (24 horas)** y se mantiene separado de los datos del período de 43,200 minutos de [Caso C](CASE_C.md). No sustituye el [comparativo anterior](CASE_C_RESULTS_COMPARISON.md).

## Tiempos del día

| Concepto | Valor | Unidad |
|---|---:|---|
| Total Time | 1440 | min |
| Business External Time | 0 | min |
| Plant Available Time | 1440 | min |
| Plant Decision Time | 0 | min |
| Production Available Time | 1440 | min |
| Downtime | 636 | min |
| Run Time | 804 | min |
| AU / Effective Runtime | 684 | min |
| UPDT | 756 | min |
| Rate Loss Minutes | 119 | min |

Valores transcritos de la primera imagen. Los tiempos se registran en minutos, de acuerdo con el horizonte diario y la etiqueta Rate Loss Minutes; las demás filas no muestran la unidad explícita.

## Valores mostrados en las gráficas

| Concepto | Valor | Unidad | Observación |
|---|---:|---|---|
| AU% | 44.09 | % | Gráfica de barras, segunda imagen. |
| UPDT% | 46.81 | % | Gráfica de barras, segunda imagen. |
| Porcentaje visible en la gráfica DTD UPDT | 20.27 | % | La captura está recortada; falta confirmar la definición y el denominador. |
| UPDT Impact | 756 | min | Etiqueta en la gráfica circular, tercera imagen; coincide con UPDT de la tabla. |

Los porcentajes se conservan tal como aparecen. No se los identifica automáticamente como OEE ni se los recalcula para reemplazar la fuente.

## Paros y confiabilidad — capturas adicionales

Datos recibidos el 16 de octubre de 2026. La segunda captura adicional identifica el **Labeler** de la línea **FIFCA00G**, con período **2025-11-03 a 2025-11-03**. El selector muestra `11/03/2025`; la fecha ISO del encabezado permite identificarla como 3 de noviembre. Se ven tres turnos seleccionados, con nombres truncados, y cuatro crews seleccionados (`C, D, B, A`); son filtros, no una secuencia cronológica confirmada.

| Equipo / alcance | Concepto | Valor | Unidad | Observación |
|---|---|---:|---|---|
| Labeler, período seleccionado | Minor Stops | 108 | paros | Gráfica de conteos; no son minutos. |
| Labeler, período seleccionado | Participación de Minor Stops | 100.00 | % de paros representados | No representa el porcentaje de tiempo perdido. |
| Labeler, período seleccionado | MTBF — Minor Stops | 6.1 | min, por confirmar | La captura no imprime la unidad junto al valor. |
| Labeler, período seleccionado | MTTR — Minor Stops | 0.5 | min, por confirmar | La captura no imprime la unidad junto al valor. |
| Labeler, período seleccionado | MTBF — Major Stops | null | No disponible | Se conserva `null`; no equivale a cero. |
| Labeler, período seleccionado | MTTR — Major Stops | null | No disponible | Se conserva `null`; no equivale a cero. |

### Filas visibles de la tabla MTBF/MTTR

La parte izquierda de la segunda captura está recortada. No se puede asignar con certeza una causa a cada fila. Los índices siguientes indican únicamente su orden visible.

| Fila visible | Downtime Stops | Major Stops | Minor Stops | MTBF Major Stops | MTTR Major Stops | MTBF Minor Stops | MTTR Minor Stops |
|---|---:|---:|---:|---|---|---:|---:|
| 1 | 40 | 0 | 40 | null | null | 16 | 0.5 |
| 2 | 32 | 0 | 32 | null | null | 20 | 0.4 |
| 3 | 8 | 0 | 8 | null | null | 82 | 0.5 |
| 4 | 6 | 0 | 6 | null | null | 109 | 0.6 |

Las columnas Stops son conteos; las unidades de MTBF/MTTR quedan pendientes de confirmar como minutos. Las cuatro filas suman **86 paros menores**, frente a los **108** del gráfico: faltan **22** si ambos elementos comparten exactamente el mismo alcance. La tabla visible es parcial, no un desglose completo. No se promedian los MTBF de las filas para sustituir el MTBF agregado de 6.1.

### Primera captura adicional

- La gráfica de contribución por equipo muestra al **Filler** con la barra más grande, seguido de **Labeler**, **CasePacker**, **Palletizer** y **Feeder**. También aparecen conveyors con contribuciones visualmente pequeñas.
- Los porcentajes y el denominador no se transcriben como cifras confirmadas por la borrosidad y el recorte. La barra mayor no demuestra por sí sola que el Filler sea la causa única de la pérdida.
- Se leen las causas `Manual Operation`, `Stuck Label`, `Down Bottle` y `Unknown` en una tabla de downtime. Sus números no se registran como confirmados por falta de nitidez. No se asignan automáticamente a las cuatro filas de la otra captura.

### Uso posterior

Estos datos permiten comparar la frecuencia y duración de los paros del Labeler y priorizar la revisión del Filler. Los valores diarios del Labeler (MTBF 6.1, MTTR 0.5) se conservan separados de la referencia del Caso C (MTBF 5.1, MTTR 0.7); no se cambia automáticamente la configuración del simulador. Antes de utilizarlos como entradas se confirmarán las unidades, la definición del tiempo base de MTBF y qué causas incluye el indicador Minor Stops. Un paro operativo o por interacción de línea no debe duplicarse como falla aleatoria y como evento programado.

## Comprobaciones aritméticas para la comparación posterior

Estas operaciones son derivadas de los datos transcritos; no son resultados de simulación.

| Comprobación | Resultado | Observación |
|---|---:|---|
| Downtime + Run Time | 1440 min | Coincide con Production Available Time. |
| Effective Runtime + UPDT | 1440 min | Coincide con el total del día. |
| Run Time − Effective Runtime | 120 min | Difiere en 1 min de Rate Loss Minutes (119 min). |
| Downtime + Rate Loss Minutes | 755 min | Difiere en 1 min de UPDT (756 min). |
| Effective Runtime / Plant Available Time × 100 | 47.50% | No coincide con AU% de la gráfica (44.09%). |
| UPDT / Production Available Time × 100 | 52.50% | No coincide con UPDT% de la gráfica (46.81%). |

Las diferencias se dejan pendientes de aclarar. No se asume que sean errores ni se corrigen los valores: pueden intervenir redondeo, filtros, alcance o definiciones distintas.

## Información pendiente

- Confirmar que las tres capturas iniciales corresponden al 3 de noviembre de 2025, como la captura adicional de MTBF/MTTR, y que comparten filtros, línea y producto/formato.
- Definiciones y denominadores de AU%, UPDT% y DTD UPDT.
- Producción total, unidad de conteo y Throughput/Shift del día; duración de los turnos.
- SKU Count, Size Type Count, Avg Line Speed y Weight / Unit: se ven los nombres, pero los valores quedaron fuera de la tercera captura. No se heredan los valores del período anterior.
- CO Count, Avg CO Duration, Distinct CO Types, CO RampUp UPDT% y Average Runsize (KPcs): valores no visibles.
- Producto/formato utilizado y botellas por caja aplicables a este día.
- Confirmación de velocidades del día y MTBF/MTTR de los demás equipos; confirmar las unidades y alcance de los valores del Labeler y completar el desglose de Downtime por equipo/causa. Los agregados de Downtime y UPDT no se ingresarán automáticamente como eventos adicionales, porque podrían duplicar pérdidas que ya modela el motor.
- Horarios de los paros y condiciones iniciales de la línea para reproducir el período.

## Fuentes

1. `image-1792181513797.jpg`: tabla de tiempos del día.
2. `image-1792181535576.jpg`: porcentajes AU%, UPDT% y gráfica DTD UPDT parcialmente visible.
3. `image-1792181584843.jpg`: gráfica circular y etiquetas de perfiles de producción y changeover, sin valores visibles en esos perfiles.

4. `image-1792181868361.jpg`: gráfica de contribución por equipo y tabla de causas parcialmente legible.
5. `image-1792181877141.jpg`: filtros del período y análisis de paros y MTBF/MTTR del Labeler.

La asociación de estas capturas con el Caso C fue indicada por el usuario. La comparación con `Case C 2.0-complete.json` se documenta por separado en [Comparación diaria](CASE_C_DAILY_RESULTS_COMPARISON.md).

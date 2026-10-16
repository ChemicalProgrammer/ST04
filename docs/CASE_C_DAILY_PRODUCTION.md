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

## Producción y formato confirmados

El usuario confirmó **12 botellas por caja**, **Throughput/Shift = 4180 cajas** y **3 turnos por día**. La captura `image-1792184164266.jpg` completa el perfil de producción y changeover:

| Concepto | Valor | Unidad / observación |
|---|---:|---|
| Botellas por caja | 12 | botellas/caja; confirmado por el usuario |
| Throughput/Shift | 4180 | cajas/turno; confirmado por el usuario |
| Turnos por día | 3 | turnos/día; confirmado por el usuario |
| Producción diaria derivada | 12540 | cajas/día = 4180 × 3 |
| Producción por turno derivada | 50160 | botellas/turno = 4180 × 12 |
| Producción diaria derivada | 150480 | botellas/día = 4180 × 3 × 12 |
| Flujo medio sobre 1440 min | 104.5 | botellas/min = 150480 / 1440 |
| SKU Count | 1 | SKU |
| Size Type Count | 1 | tipo de tamaño |
| Avg Line Speed | 220 | Unidad no impresa; compatible con botellas/min por la identidad de producción indicada abajo |
| Weight / Unit | 98 | Unidad no visible; no se asume g u otra unidad |
| CO Count | 0 | changeovers |
| Avg CO Duration | null | No disponible; no se reemplaza por cero |
| Distinct CO Types | 1 | Valor conservado aunque CO Count sea cero; definición pendiente |
| CO RampUp UPDT% | 0.0 | % |
| Average Runsize (KPcs) | 0 | KPcs, como aparece en la fuente; definición/alcance pendiente |

La producción diaria es una derivación del promedio por turno reportado; puede conservar su redondeo y no sustituye un contador exacto de producción si se dispone de él. En 24 horas, tres turnos corresponden a 8 horas nominales por turno; la captura no aporta sus horarios ni producción individual.

**Comprobación nueva: 684 min efectivos × 220 botellas/min = 150480 botellas**, exactamente la producción diaria derivada. Esto respalda la interpretación de 220 como referencia de velocidad del tiempo efectivo del reporte. No confirma por sí solo todas las definiciones de AU/OEE o calidad.

Con referencia común de 300 botellas/min, la misma producción equivale a **501.6 min ideales** y a **34.8333% de producción / capacidad nominal diaria**. Es una normalización calculada, no un nuevo OEE reportado por planta. El 47.50% calculado como 684/1440 utiliza otra referencia de velocidad; no se debe restar directamente del OEE del simulador sobre 300 botellas/min para atribuir un error al modelo. La discrepancia entre AU% gráfico 44.09% y AU% derivado de los tiempos 47.50% sigue pendiente.

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

- La gráfica de contribución por equipo muestra al **Filler** con la barra más grande, seguido de **Labeler**, **CasePacker**, **Palletizer** y **Feeder**. También aparecen otros equipos con contribuciones visualmente pequeñas; los nombres se precisan en la captura más nítida descrita abajo.
- Los porcentajes no eran suficientemente legibles en esta primera captura. Una imagen posterior permite transcribirlos (véase la sección siguiente); su denominador sigue pendiente. La barra mayor no demuestra por sí sola que el Filler sea la causa única de la pérdida.
- Se leen las causas `Manual Operation`, `Stuck Label`, `Down Bottle` y `Unknown` en una tabla de downtime. Sus números no se registran como confirmados por falta de nitidez. No se asignan automáticamente a las cuatro filas de la otra captura.

### Capturas más nítidas recibidas a continuación

La captura `image-1792183905042.jpg` permite precisar la gráfica de contribución:

| Equipo de la gráfica | Contribución mostrada | Unidad |
|---|---:|---|
| Filler | 78.8 | % |
| Labeler | 7.8 | % |
| CasePacker | 6.9 | % |
| Palletizer | No visible como cifra | % |
| Feeder | No visible como cifra | % |
| CaseFormer | No visible como cifra | % |
| PalletWrapper | No visible como cifra | % |

El encabezado de esta gráfica dice **Line / Equip Util Reasons %**. En el reporte también se ven una vista **Line / Equip Util Reasons (Minutes)** y una pestaña **Downtime (Min) MTBF and MTTR**. Por tanto, hay vistas de minutos y vistas de porcentajes: **78.8%, 7.8% y 6.9% no son minutos ni porcentaje del día completo**. Falta conocer el denominador de contribución para convertirlos a tiempo; no se multiplican automáticamente por 636 o 756 min. Los tres porcentajes legibles suman 93.5%; el resto agregado sería 6.5% si comparten el mismo total, con el redondeo de la gráfica.

CaseFormer y PalletWrapper aparecen en el reporte operativo y no están representados como equipos separados en la exportación de nueve elementos analizada. No se asignan contribuciones cero ni se identifica Feeder automáticamente con Unscrambler sin confirmar el mapeo.

La captura `image-1792183911448.jpg` muestra otra selección de equipo cuyo nombre quedó recortado:

| Concepto | Valor mostrado | Unidad / estado |
|---|---:|---|
| MTBF — Minor Stops | 34.3 | Probablemente min; pendiente de confirmación explícita |
| MTTR — Minor Stops | 1.0 | Probablemente min; pendiente de confirmación explícita |
| MTBF — Major Stops | null | No disponible; no equivale a cero |
| MTTR — Major Stops | null | No disponible; no equivale a cero |
| Valor del sector rojo | 17 (100.00%) | Se ve el encabezado Major & Minor Downtime; no se registra como conteo de paros sin verificar la vista y unidad |

El período visible vuelve a ser **2025-11-03 a 2025-11-03**. La interpretación temporal es coherente con minutos (MTTR 1.0 min = 60 s), pero el nombre de la pestaña Downtime (Min) no confirma por sí solo la unidad de todos los indicadores de confiabilidad. El usuario lo considera probable; se conserva como tal. **No se reemplazan con 34.3/1.0 los valores 6.1/0.5 del Labeler**, porque no está identificado el equipo de esta nueva selección. Las filas inferiores también están recortadas y no se agregan al desglose del Labeler.

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
- Contador exacto de producción y distribución/horarios por turno, si están disponibles; la producción diaria derivada del promedio de 4180 cajas/turno ya está registrada.
- Confirmar explícitamente la unidad y definición de Avg Line Speed (220) y Weight / Unit (98). Los conteos de SKU y tamaño ya están visibles en la nueva captura.
- Definiciones de Distinct CO Types = 1 y Average Runsize = 0 KPcs con CO Count = 0; conservar null de Avg CO Duration.
- Identificación/dimensiones del único producto y tamaño del día; las 12 botellas/caja ya están confirmadas.
- Confirmación de velocidades del día y MTBF/MTTR de los demás equipos; confirmar las unidades y alcance de los valores del Labeler y completar el desglose de Downtime por equipo/causa. Los agregados de Downtime y UPDT no se ingresarán automáticamente como eventos adicionales, porque podrían duplicar pérdidas que ya modela el motor.
- Horarios de los paros y condiciones iniciales de la línea para reproducir el período.

## Fuentes

1. `image-1792181513797.jpg`: tabla de tiempos del día.
2. `image-1792181535576.jpg`: porcentajes AU%, UPDT% y gráfica DTD UPDT parcialmente visible.
3. `image-1792181584843.jpg`: gráfica circular y etiquetas de perfiles de producción y changeover, sin valores visibles en esos perfiles.

4. `image-1792181868361.jpg`: gráfica de contribución por equipo y tabla de causas parcialmente legible.
5. `image-1792181877141.jpg`: filtros del período y análisis de paros y MTBF/MTTR del Labeler.

6. `image-1792183905042.jpg`: contribuciones legibles Filler 78.8%, Labeler 7.8% y CasePacker 6.9%; encabezados de vistas en minutos y porcentajes.
7. `image-1792183911448.jpg`: MTBF 34.3 y MTTR 1.0 de una selección de equipo no identificada; mismo período ISO.

8. `image-1792184164266.jpg`: perfil de producción y changeover; confirmación del usuario de 12 botellas/caja, 4180 cajas/turno y 3 turnos/día.

La asociación de estas capturas con el Caso C fue indicada por el usuario. La comparación con `Case C 2.0-complete.json` se documenta por separado en [Comparación diaria](CASE_C_DAILY_RESULTS_COMPARISON.md).

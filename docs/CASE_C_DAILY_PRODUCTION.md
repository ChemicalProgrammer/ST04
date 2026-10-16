# Caso C — Registro de un día de producción

Registro recibido el 16 de octubre de 2026 para una comparación posterior con una simulación. Año mostrado en las capturas: **2025**. La fecha exacta del día de producción no está visible.

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

- Fecha exacta, filtros y alcance de las tres capturas; confirmar que corresponden al mismo día, línea y producto/formato.
- Definiciones y denominadores de AU%, UPDT% y DTD UPDT.
- Producción total, unidad de conteo y Throughput/Shift del día; duración de los turnos.
- SKU Count, Size Type Count, Avg Line Speed y Weight / Unit: se ven los nombres, pero los valores quedaron fuera de la tercera captura. No se heredan los valores del período anterior.
- CO Count, Avg CO Duration, Distinct CO Types, CO RampUp UPDT% y Average Runsize (KPcs): valores no visibles.
- Producto/formato utilizado y botellas por caja aplicables a este día.
- Confirmación de velocidades y MTBF/MTTR del día, y desglose de Downtime por equipo/causa si se dispone de él. Los agregados de Downtime y UPDT no se ingresarán automáticamente como eventos adicionales, porque podrían duplicar pérdidas que ya modela el motor.
- Horarios de los paros y condiciones iniciales de la línea para reproducir el período.

## Fuentes

1. `image-1792181513797.jpg`: tabla de tiempos del día.
2. `image-1792181535576.jpg`: porcentajes AU%, UPDT% y gráfica DTD UPDT parcialmente visible.
3. `image-1792181584843.jpg`: gráfica circular y etiquetas de perfiles de producción y changeover, sin valores visibles en esos perfiles.

La asociación de estas capturas con el Caso C fue indicada por el usuario. Todavía no se ha realizado la comparación con una simulación de este día.

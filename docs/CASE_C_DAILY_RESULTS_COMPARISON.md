# Caso C — Comparación diaria con Case C 2.0

Fecha de análisis: 16 de octubre de 2026. Actualizado con una segunda corrida que ajusta MTBF/MTTR; véase la sección «Segunda corrida». Fuente de simulación: `Case C 2.0-complete.json`, Simulation A. Referencia operativa: [registro diario del Caso C](CASE_C_DAILY_PRODUCTION.md). La captura adicional de confiabilidad indica **3 de noviembre de 2025**; falta confirmar que las capturas de tiempos y porcentajes comparten ese día y filtros.

## Conclusión

La simulación es estable entre sus cinco semillas, pero **esta corrida todavía no valida la reproducción del día de producción**. Su OEE medio es **32.62%**. Los tiempos registrados dan **47.50%** de utilización efectiva; la diferencia es **-14.88 puntos porcentuales**, únicamente si ambos indicadores comparten referencia de velocidad, calidad y denominador. La gráfica operativa muestra AU **44.09%**, que tampoco coincide con los tiempos de su tabla.

El principal hallazgo de configuración es que la corrida mantiene un flujo homogéneo de `units`, sin catálogo de productos/formatos ni conversión botella/caja. El conveyor PAC-PAL limita ese flujo a aproximadamente **104.81 unidades/min**, frente a **300 unidades/min** de la máquina de referencia. Si los paquetes de 310 mm son cajas, ese límite debe expresarse en cajas y convertirse a botellas equivalentes antes de compararlo con la línea. El archivo no realiza esa conversión.

Además, el Labeler conserva MTBF **5.1 min** y MTTR **0.7 min**, mientras que la captura diaria muestra **6.1** y **0.5**, cuyas unidades y base de cálculo deben confirmarse. La cantidad de fallas simuladas del Labeler es muy superior al conteo de paros menores registrado. No basta con aumentar el número de rondas: primero hay que alinear unidades, parámetros y definiciones.

## Alcance de la corrida

- Motor `ST_CURRENT`, versión del replay `0.17.0`; nueve elementos: cinco máquinas y cuatro conveyors.
- **5 rondas completas de 86,400 s (1,440 min)**. Aunque la configuración conserva `durationMode: INDEFINITE`, cada resultado guardado tiene ese horizonte completo.
- Semillas **20260909–20260913**; paso **0.25 s**; muestras solicitadas cada **5 s**.
- Eventos desactivados, comandos vacíos y calendario vacío. Esto es coherente con los agregados de Business External Time y Plant Decision Time iguales a cero, pero no demuestra que se reprodujeron los paros operativos del día.
- `products: null`; no hay `productCatalog`, `initialFormatId`, `initialProductId` ni `flowUnits` explícitos en los equipos. La referencia de 12 botellas/caja no está aplicada en esta corrida.
- La firma de entradas guardada coincide con los equipos exportados: no se comparan resultados de una configuración distinta de la que conserva este archivo.
- Se utilizan **medias de cinco rondas**, salvo donde se indica primera ronda. No se hereda el throughput de 54 del período anterior como dato de este día.

## Comparación principal

| Concepto | Registro diario | Simulación, media de 5 rondas | Observaciones |
|---|---:|---:|---|
| Horizonte | 1440 min | 1440 min | Coincide por ronda. |
| Business External Time | 0 min | Sin exclusiones configuradas | Coherencia de configuración; no identifica causas de downtime. |
| Plant Decision Time | 0 min | Sin eventos programados | Coherente con el agregado reportado. |
| Production Available Time | 1440 min | Horizonte completo de 1440 min | No se descontó calendario. |
| AU / Effective Runtime | 684 min | 469.78 min equivalentes a 300 unidades/min | Comparación condicionada a que la fuente utilice esa misma referencia y unidad. |
| Utilización calculada desde los tiempos | 47.50% | OEE 32.62% | Diferencia -14.88 pp; no se establece equivalencia AU = OEE sin confirmar las definiciones. |
| AU de la gráfica | 44.09% | OEE 32.62% | Diferencia -11.47 pp; la gráfica operativa no coincide con su tabla. |
| Downtime de línea | 636 min | Sin agregado directamente equivalente | La suma de fallas de equipos no equivale a tiempo de línea detenida. |
| Run Time de línea | 804 min | Sin agregado directamente equivalente | `runningSeconds` pertenece a cada equipo y no es un Run Time global homologado. |
| UPDT | 756 min | Sin agregado directamente equivalente | No se lo iguala automáticamente a 100 − OEE ni a suma de fallas. |
| Rate Loss Minutes | 119 min | Sin agregado directamente equivalente | Las pérdidas parciales son métricas por equipo; pueden solaparse y no se suman como pérdida global. |
| Producción del día | No visible | 140933.10 unidades del modelo | No se puede calcular el error de producción sin el dato operativo y su unidad. |
| Throughput medio | No visible | 97.87 unidades del modelo/min | No se lo etiqueta como botellas/min o cajas/min hasta resolver las unidades. |
| Producción por 8 h, calculada como promedio diario / 3 | No visible | 46977.70 unidades del modelo | No es un resultado guardado por turno; `trackShifts: false`. |
| Desborde de producto | No informado | 2225.94 unidades del modelo | El simulador registra overflow. Falta determinar si existe un fenómeno equivalente en planta. |

Los minutos efectivos simulados se calculan como producción media / 300; equivalen a OEE medio × 1440 / 100. No se calcula producción operativa a partir de 684 min porque falta confirmar su referencia de velocidad.

## Repetibilidad entre rondas

| Ronda | Semilla | OEE (%) | Producción, unidades del modelo |
|---|---:|---:|---:|
| 1 | 20260909 | 32.5188 | 140481.09 |
| 2 | 20260910 | 32.4093 | 140008.14 |
| 3 | 20260911 | 32.4786 | 140307.43 |
| 4 | 20260912 | 32.6403 | 141006.23 |
| 5 | 20260913 | 33.0701 | 142862.63 |

El OEE va de **32.41% a 33.07%**, con desviación estándar **0.263 pp**. El coeficiente de variación de producción es **0.81%**. Esto indica repetibilidad interna con estos parámetros; no demuestra exactitud frente a planta. Las cinco semillas no constituyen cinco días observados.

## Labeler: comparación de confiabilidad

| Concepto | Captura diaria del Labeler | Simulación | Observación |
|---|---:|---:|---|
| MTBF de paros menores / parámetro de fallas | 6.1, unidad por confirmar | 5.1 min configurados | No es la misma entrada; confirmar si el cálculo operativo usa tiempo de marcha, disponible o calendario. |
| MTTR de paros menores / duración de reparación | 0.5, unidad por confirmar | 0.7 min configurados | La duración configurada es 40% mayor si la unidad operativa es min. |
| Conteo de paros | 108 Minor Stops | 255.8 fallas por día | 2.37 veces el conteo registrado. Minor Stops y fallas aleatorias requieren homologar causas y definición. |
| Rango de conteo | 108 | 243–277 | El conteo operativo está por debajo del rango de estas cinco rondas. |
| Tiempo de falla | No visible como total confirmado | 179.06 min | No se afirma un error de minutos sin el total operativo. |
| MTBF/MTTR de Major Stops | null / null | Sin separación Major/Minor configurada | `null` no se reemplaza por cero. `microStopSeconds` es cero en la corrida; los 108 Minor Stops no se modelaron explícitamente como esa clase. |

Los MTBF/MTTR generales de este archivo siguen siendo los del Caso C anterior. Cambiar únicamente el Labeler a 6.1/0.5 sería una prueba de sensibilidad, no una calibración validada ni una forma de corregir la conversión de unidades pendiente.

## Equipos: señales de diagnóstico

| Equipo | MTBF / MTTR configurados (min) | Fallas medias | Tiempo de falla medio (min) | Back-up stop medio (min) | Comparación / observación |
| Unscrambler | 31 / 1.3 | 47.0 | 61.10 | 880.53 | Sin detalle diario confirmado para homologar estas métricas. |
| Labeller | 5.1 / 0.7 | 255.8 | 179.06 | 735.55 | Referencia operativa: 108 paros menores; mayor discrepancia de frecuencia documentada. |
| Filler | 14.6 / 1 | 92.8 | 92.80 | 603.87 | La gráfica operativa muestra 78.8% de contribución; faltan denominador y tiempos por causa para homologar. |
| Case Packer | 8.9 / 0.4 | 156.2 | 62.43 | 34.02 | Sin detalle diario confirmado para homologar estas métricas. |
| Palletizer | 48.5 / 1.4 | 23.8 | 33.32 | 0.00 | Sin detalle diario confirmado para homologar estas métricas. |

Los tiempos de diferentes equipos pueden coincidir; **no se suman para compararlos con 636 min de downtime de línea**. Back-up stop describe una interacción de flujo, no una falla propia. La simulación concentra más tiempo de falla en el Labeller que en el Filler, pero esto no es directamente la misma métrica que la gráfica operativa de contribución.

## Conveyors y coherencia de unidades

| Conveyor | Velocidad manual (m/min) | Pitch efectivo del modelo (mm) | Capacidad de transferencia (unidades del modelo/min) |
|---|---:|---:|---:|
| Conveyor US-LAB | 29.93 | 80.80 | 370.42 |
| Conveyor LAB-FIL | 33.16 | 80.80 | 410.40 |
| Conveyor FIL-CAS | 40.84 | 191.90 | 212.82 |
| Conveyor PAC-PAL | 32.49 | 310.00 | 104.81 |

La transferencia de PAC-PAL equivale a **34.94%** de la referencia de 300 unidades/min. La producción media de **97.87 unidades/min** se aproxima a ese techo de transporte nominal. Esta evidencia apunta a una restricción importante del modelo; no prueba por sí sola toda la causalidad de las pérdidas.

Si los paquetes de PAC-PAL son cajas de **12 botellas**, sus **104.81 cajas/min** representarían **1257.68 botellas equivalentes/min**, y la capacidad física de 120 paquetes de esa zona representaría 120 cajas / 1440 botellas. Esa conversión es ilustrativa y condicional: **no se aplicó en el archivo** y el formato del día no está confirmado. No conviene aumentar artificialmente la velocidad del conveyor para hacer coincidir la producción; hay que representar las unidades correctas.

El **Nominal machine-speed gap** de esta configuración es **0%**: todas las máquinas alcanzan como mínimo las 300 unidades/min nominales del Filler. Esto no implica ausencia de restricciones de conveyor. El archivo no guarda un diagnóstico emparejado sin fallas (`lossDiagnostic`); por tanto, no se asigna un porcentaje numérico a Conditional MTBF/MTTR loss o Remaining loss without failures a partir de los tiempos por equipo.

## Segunda corrida — ajuste de MTBF/MTTR sin producto ni formato

Archivo adicional: `Case C 2.0-complete(1).json`, recibido el 16 de octubre de 2026. Resultados completados a las **14:37:56** de Ciudad de México. Se conserva la comparación anterior como primera corrida; esta sección documenta la prueba posterior solicitada por el usuario, sin exigir agregar producto o formato.

### Cambios verificados

- Labeler: MTBF **5.1 → 6.1 min** y MTTR **0.7 → 0.5 min**, tanto en `noiseProfile.reliability` como en `processData.equipment`.
- También cambiaron las etiquetas de unidades: Case Packer **BOTTLES → CASES**; Conveyor PAC-PAL y Palletizer **CASES → CASES**. No se agregaron producto, formato, catálogo ni botellas por caja; `products` sigue siendo `null`. Por eso no se activa una conversión de 12 botellas/caja. Estas etiquetas no convierten por sí solas los conteos.
- No cambió la configuración de corrida: cinco rondas de 24 h, semillas **20260909–20260913**, eventos desactivados, tick 0.25 s, mismas velocidades y geometrías. Las firmas guardadas coinciden con los equipos de cada exportación.

### Resultado antes y después

Todas las cifras simuladas de esta tabla son medias de cinco rondas.

| Indicador | Primera corrida | Segunda corrida | Cambio |
|---|---:|---:|---:|
| OEE global | 32.623403% | 32.624090% | +0.000687 pp |
| Producción diaria, unidades del modelo | 140933.10 | 140936.07 | +2.97 |
| Throughput, unidades del modelo/min | 97.870210 | 97.872270 | +0.002060 |
| Fallas del Labeler, conteo | 255.8 | 221.6 | -34.2 |
| Tiempo de falla del Labeler | 179.06 min | 110.80 min | -68.26 min |
| Back-up stop del Labeler | 735.55 min | 799.92 min | +64.36 min |
| Tiempo running del Labeler | 481.37 min | 481.56 min | +0.19 min |

La ganancia de producción es **0.0021%**: prácticamente nula a escala del día. En la primera ronda la producción es exactamente igual antes y después (**140481.093837** unidades); en la segunda aumenta **14.835403** unidades. Las demás diferencias de producción son nulas o menores que 0.001 unidades. Se compararon las cinco semillas, no solo la primera ronda que muestra el replay.

### Interpretación

El ajuste sí tuvo efecto: el tiempo de falla del Labeler disminuyó **38.12%**. Sin embargo, su tiempo Back-up stop aumentó **64.36 min**, mientras su tiempo running creció solo **0.19 min**. Es compatible con una línea limitada aguas abajo: recuperar disponibilidad del Labeler no garantiza mayor producción final si no hay capacidad para evacuarla. Estos tiempos no se interpretan como un reparto causal exacto porque son métricas de estados y pueden tener coberturas distintas.

El límite nominal de PAC-PAL continúa en **104.81 unidades del modelo/min** y el throughput queda en **97.87 unidades/min**. La prueba muestra baja sensibilidad de la salida a este ajuste de confiabilidad, dentro de la configuración actual; no demuestra que mejorar el Labeler sea inútil en planta ni resuelve la conversión botella/caja pendiente.

### Contraste con el Labeler del día observado

La segunda corrida pasa de **2.37 a 2.05 veces** los **108 paros menores** de la captura. Por tanto, igualar los números de MTBF/MTTR no igualó todavía la frecuencia de paros.

Una razón concreta que debe homologarse es la base de tiempo. En el motor actual, `updateReliabilityFailures` descuenta el reloj de fallas mientras el equipo está habilitado en AUTO/MANUAL, incluso si su estado de flujo está en Back-up stop; no lo limita a tiempo RUNNING. Solo se suspende bajo las condiciones explícitas del motor, por ejemplo reparación, emergencia, calendario o microparo. Sin restricciones adicionales, una aproximación de renovación de **1440 / (6.1 + 0.5) = 218.18** fallas/día es coherente en orden de magnitud con las **221.6** simuladas. Esa aproximación no es el dato operativo ni una corrida adicional.

Hay que confirmar si el MTBF operativo de 6.1 está calculado con tiempo de marcha, tiempo habilitado u otro denominador, y qué causas comprende Minor Stops. No se debe alterar MTBF hasta forzar 108 paros sin aclarar esa definición.

La utilización derivada de la tabla diaria sigue siendo **47.50%**, frente a OEE **32.62%** en la segunda corrida: diferencia **-14.88 pp**, condicionada a homologar indicadores. Sigue faltando la producción total del día para validar throughput directamente.

No se modificó el simulador ni se ejecutaron nuevas corridas durante este análisis. La comparación utiliza exclusivamente las dos exportaciones recibidas.

SHA-256 del archivo adicional: `3f55067768ca945782fd6ff2d88ca65056b3edccdcd96b00bc27a53cdfb891c0`.

## Qué falta y siguiente comparación

1. Confirmar que todas las capturas son del mismo día y filtros. Resolver AU 44.09% frente a 47.50% derivado de la tabla, y UPDT% 46.81% frente a 52.50% derivado de sus minutos.
2. Confirmar producto/formato, tamaño físico de las cajas, botellas por caja y unidad de velocidad de Case Packer/Palletizer. Configurar la conversión Bottle → Case y el tramo de cajas con el catálogo existente, conservando velocidades físicas medidas.
3. Obtener producción total del día y su unidad, con la misma frontera de salida que el simulador. Confirmar que AU/Effective Runtime usa 300 botellas/min si se desea compararlo con ese OEE.
4. Confirmar unidades, denominador y causas del MTBF/MTTR diario del Labeler; obtener los mismos datos de los demás equipos. No convertir downtime operativo, bloqueo o falta de material en fallas aleatorias adicionales.
5. Repetir el día de 24 h con unidades y parámetros homologados, conservar semillas para la comparación entre configuraciones y revisar producción, overflow, estados y conteos de paros. No cargar 636 min como un paro adicional: sería imponer la salida observada y podría duplicar las fallas ya simuladas.

## Fortalezas y mejoras del simulador

- La exportación conserva entradas exactas, semillas, cinco rondas, estadísticas y estado por equipo; permite localizar las diferencias sin depender solo del OEE.
- Se guardan velocidades manuales y capacidad efectiva de transferencia, útiles para detectar el límite de PAC-PAL.
- El balance de materiales de la primera ronda cierra: **143568 entradas = 140481.093837 salidas + 857.465740 inventario + 2229.440423 overflow**, con residual guardado cero. El overflow debe investigarse, aunque el balance cierre.
- La función de productos/formatos ya existe, pero no está utilizada en esta exportación. La primera acción es configurar la corrida correctamente.
- Conviene añadir una advertencia de coherencia cuando un tramo posterior a Case Packer conserva unidades homogéneas junto a dimensiones compatibles con cajas. La advertencia debe pedir confirmación, sin inferir una conversión por el nombre del equipo.
- Conviene disponer de métricas globales de downtime/run time con definiciones explícitas y de una separación documentada entre paros operativos, microparos y fallas/reparaciones. Eso facilitaría comparar con el reporte de planta sin sumar tiempos solapados.

Estas son recomendaciones; no se modificó el motor ni la configuración del caso exportado durante este análisis. No se ejecutaron nuevas simulaciones o escenarios: los resultados comparados son los del archivo recibido.

## Trazabilidad

- Archivo recibido: `Case C 2.0-complete.json`.
- SHA-256: `2a89ea67b5bfdfc14b36a11e3e8b255f18a11342d03d853fe3191cc1358fbacc`.
- Resultados completados: `2026-10-16T20:27:58.005Z` (14:27:58, hora de Ciudad de México).
- Se verificaron las medias contra las cinco filas y la identidad OEE = producción / (300 × 1440) × 100, dentro del redondeo guardado.
- No se publicó el JSON original ni datos de cuenta contenidos en él. Los valores de las imágenes y sus limitaciones están conservados en [el registro diario](CASE_C_DAILY_PRODUCTION.md).

## Aclaración posterior sobre las unidades de las capturas

Las imágenes `image-1792183905042.jpg` y `image-1792183911448.jpg` muestran vistas separadas de minutos y porcentajes. Se precisaron las contribuciones operativas de Filler **78.8%**, Labeler **7.8%** y CasePacker **6.9%**, conservando pendiente el denominador. No son proporciones confirmadas de las 24 h ni equivalentes a la suma de tiempos de falla simulados.

La nueva selección muestra MTBF **34.3** y MTTR **1.0**, probablemente minutos, pero el equipo está fuera del recorte. Esos datos se conservan en el registro diario como selección pendiente de identificar, sin asignarlos al Filler o al Labeler ni cambiar las entradas de ninguna corrida. El resultado del sector rojo **17** aparece bajo Major & Minor Downtime; no se utiliza como conteo confirmado. Véanse los detalles y fuentes en [el registro diario](CASE_C_DAILY_PRODUCTION.md).

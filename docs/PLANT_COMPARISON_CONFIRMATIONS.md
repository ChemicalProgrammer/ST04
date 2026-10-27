# Confirmaciones para comparar planta y simulación

Actualizado: 27 de octubre de 2026. Estado: definiciones AEM documentadas; conciliación de registros de la base de planta del Caso C pendiente.

## Fuentes y alcance

Se revisaron las dos series de fotografías aportadas el 27 de octubre: secciones I–X y figuras 1–5 del documento AEM, identificado en el pie visible como TIL 97-015, 14 de julio de 1997. Las definiciones siguientes proceden de sus secciones IV y V; las diferencias con OEE, de la sección VII y figura 5.

Los valores del Caso C provienen de bases de datos de planta; la hoja únicamente los presenta. Las fórmulas AEM ya están documentadas y ejemplificadas. La tarea pendiente es conciliar esos registros concretos con su período, unidades, alcance y lógica de generación; no pedir fórmulas de celdas ni volver a solicitar la definición general de AU. Las fotografías y el texto íntegro no se incorporan al repositorio; se resume lo necesario para esta comparación.

Consultar primero el [compendio de conceptos, fórmulas y ejemplos AEM](AEM_CONCEPTS_FORMULAS.md). La [referencia histórica de integración](ASSET_EFFECTIVENESS_MODEL.md) conserva propuestas y revisiones anteriores.

## Definiciones resueltas por el documento

| Tiempo | Definición AEM |
|---|---|
| T1 — Total Available Time | Tiempo calendario del período. |
| T2 — Plant Available Time | T1 menos Business / External Downtime. |
| T3 — Production Available Time | T2 menos Plant Decision Downtime. |
| T4 — Runtime | T3 menos Unplanned Downtime. |
| T5 — Effective Runtime | T4 menos Runtime Losses; también producción buena / velocidad estándar, con unidades coherentes. |

| Indicador | Fórmula, multiplicada por 100 |
|---|---|
| Asset Effectiveness — AE | T5 / T1 |
| Asset Utilization — AU | T5 / T2 |
| Operating Efficiency — OE | T5 / T3 |
| Runtime Efficiency — RE | T5 / T4 |

**Corrección de la comparación anterior:** el 52.00 % recalculado sobre 704 minutos es OE bajo estas condiciones, no AU. Tampoco debe equipararse automáticamente con el OEE del simulador.

Otros criterios documentados:

- La velocidad estándar es la máxima velocidad instantánea del equipo cuello de botella para cada SKU o fórmula. No es automáticamente la consigna habitual, la media observada ni el máximo de cualquier equipo aislado.
- Runtime Losses incluye pérdidas de velocidad, scrap y reproceso, expresadas como tiempo equivalente. Production Rate Losses es solo el componente de velocidad.
- Scrap y reproceso se convierten de cantidad a tiempo usando la velocidad estándar. No confundirlos con tiempo de reparación.
- Unplanned Downtime abarca averías, faltantes de proceso/material, falta imprevista de personal y otros problemas operativos. No queda limitado a fallas técnicas.
- Changeover AEM va de la última unidad buena del producto A a la primera unidad buena del B e incluye pruebas y ajustes para obtener producto vendible. Excluye la rampa posterior hasta velocidad estándar. Una rampa real de ese tipo contribuye a las pérdidas de rendimiento.
- La experimentación originada por planta pertenece a Plant Decision; las pruebas externas de I+D pertenecen a Business / External. Clasificar por motivo, no solo por la palabra “experimentación”.
- En el ejemplo de downtime de la figura 1 se sigue el paro que afecta al cuello de botella; no se suman indiscriminadamente los tiempos de todos los equipos.
- OEE y AEM no tienen necesariamente el mismo denominador: la sección VII y figura 5 clasifican setup en Unplanned Downtime de OEE, mientras AEM lo descuenta en Plant Decision. OE y OEE solo coinciden si sus bases efectivamente coinciden.

La referencia no define UPDT% ni sus denominadores, ni la distribución estadística o el reloj MTBF/MTTR.

## Reconstrucción provisional del Caso C

Supuestos por validar: un solo formato de 12 unidades/caja, 80,544 unidades buenas, velocidad estándar de 220 unidades/min, downtime de 286 minutos con alcance AEM y categorías sin solapamiento.

| Cálculo | Resultado |
|---|---:|
| T1 | 1,440 min |
| Business / External | 82 min |
| T2 = 1,440 − 82 | 1,358 min |
| Plant Decision | 654 min |
| T3 = 1,358 − 654 | 704 min |
| Unplanned Downtime | 286 min |
| T4 = 704 − 286 | 418 min |
| T5 = 80,544 / 220 | 366.11 min |
| Runtime Losses = 418 − 366.11 | 51.89 min equivalentes |
| AE = T5 / T1 | 25.42 % |
| AU = T5 / T2 | 26.96 % |
| OE = T5 / T3 | 52.00 % |
| RE = T5 / T4 | 87.59 % |

La reconstrucción explica los 366 y 52 minutos redondeados: el valor presentado como “Run Time” coincide aproximadamente con T5, y no T4. Es una inferencia aritmética condicionada a 220 unidades/min, no una confirmación del significado del campo de origen ni evidencia de un error de la base. Si existen scrap o reproceso, los 51.89 minutos son pérdidas totales en marcha; no se asignan íntegramente a velocidad sin separar esos componentes.

El documento resuelve las fórmulas generales. Quedan tres diferencias por conciliar en los registros presentados:

- Production Available Time muestra 705 min, mientras la resta produce 704.
- AU muestra 50.93 %, mientras AEM con estos supuestos produce 26.96 %.
- UPDT muestra 38.85 %, sin fórmula de porcentaje identificada.

Conservar los valores reportados y los recalculados por separado.

## Comparación con la corrida disponible

Motor continuo 0.17.6, promedio de 10 rondas, ventana continua de 704 minutos. La configuración todavía no reproduce las ventanas de paro del día completo.

| Dato | Planta / reconstrucción provisional | Simulación |
|---|---:|---:|
| Producción, unidades | 80,544 | 96,639.28 |
| Cajas de 12 | 6,712 | 8,053.27 equivalentes |
| Tiempo equivalente a 220 unidades/min | 366.11 min | 439.27 min |
| Producción / (220 × 704) | 52.00 % | 62.40 % |

Diferencia de producción: +16,095.28 unidades (+19.98 %). La diferencia no identifica por sí sola su causa.

| Diagnóstico actual de la simulación | Promedio |
|---|---:|
| Tiempo con salida final positiva | 439.57 min |
| Tiempo equivalente de producción | 439.27 min |
| Pérdida bruta de cadencia en salida | 7.00 min |
| Recuperación por salida sobre referencia | 6.70 min |
| Balance neto de cadencia en salida | 0.30 min |
| Tiempo sin salida final | 264.43 min |

Estos contadores emplean flujo en la salida final. No son automáticamente Runtime o downtime AEM medidos en el cuello de botella. Una diferencia entre puntos de medición, la descarga de acumuladores y el inventario pueden afectar el balance. El neto de salida no debe presentarse como Production Rate Losses AEM validado.

## Confirmaciones que siguen pendientes

### Prioridad 1 — Registros de origen, referencia y punto de medición

- [x] Definición general de AU resuelta: T5/T2, sección V.b; ver ejemplos de figuras 3 y 5 en el compendio.
- [ ] Obtener el diccionario de campos o una explicación de la lógica del reporte/consulta que genera AU, UPDT%, Run Time, Rate Loss y Production Available Time; solicitar valores sin redondear si están disponibles.
- [ ] Conciliar AU 50.93 % con los tiempos y producción del mismo registro: identificar período, línea, SKU, velocidad estándar, numerador, denominador y método de agregación utilizados por el reporte. No asumir que AU carece de definición.
- [ ] Identificar numerador y denominador de UPDT%; no asumir que es 286/704.
- [ ] Explicar 704 frente a 705 minutos mediante precisión original, cobertura temporal, filtros o ajustes del reporte; conservar ambos valores hasta resolverlo.
- [ ] Confirmar el significado del campo de origen “Run Time” y por qué su valor coincide con producción/220. No presuponer un rótulo erróneo.
- [ ] Validar 220 unidades/min como velocidad estándar AEM del cuello de botella para este formato, distinguiéndola de consignas y capacidades máximas configuradas.
- [ ] Identificar el cuello de botella de referencia y dónde se miden runtime, downtime, producción y velocidad.
- [ ] Confirmar que las 80,544 unidades son producto bueno y del mismo período/formato; separar scrap, reproceso y otras pérdidas.
- [ ] Confirmar si los 52 minutos representan solo velocidad o el conjunto de Runtime Losses y cómo se tratan recuperaciones sobre referencia.

### Prioridad 2 — Calendario y eventos

- [ ] Obtener inicio, fin y causa de los 82 minutos externos y 654 de decisiones de planta; evitar solapamientos en el balance.
- [ ] Identificar equipos afectados, descarga durante paros, inventario inicial/final y reinicios.
- [ ] Desglosar los 286 minutos por causa, incluyendo faltantes de material/personas y otros paros no representados por fallas técnicas.
- [ ] Confirmar la regla real de inicio/fin del paro de línea o del cuello de botella y cómo se tratan los efectos absorbidos por acumulación.
- [ ] Registrar changeover hasta primera unidad buena y cualquier rampa posterior por separado, sin duplicar pérdidas.

### Prioridad 3 — Confiabilidad

- [ ] Obtener tiempo operativo, número de fallas y duración por equipo del mismo período; idealmente inicio/fin de eventos.
- [ ] Confirmar el reloj de MTBF: procesando producto, habilitado o tiempo transcurrido; tratamiento de starvation, blocking y marcha en vacío.
- [ ] Precisar el umbral de microparo: la definición inicial dice menos de 3 o 4 minutos.
- [ ] Aclarar si los perfiles incluyen solo microparos o fallas mayores; revisar el alcance del MTTR de 17.26 min del Unscrambler frente a esa definición.
- [x] Supuesto de conveyors confirmado por el responsable consultado: para este modelo se excluyen sus fallas propias y no se requieren MTBF/MTTR. Sus efectos normales se consideran despreciables frente a los equipos primarios; esto es una simplificación, no una afirmación física de que nunca fallen.
- [ ] Registrar únicamente excepciones sistémicas o fallas relevantes de conveyors cuando exista evidencia para modelarlas.

El reloj del motor actual avanza en pasos con procesamiento positivo. La referencia AEM aportada no valida ni invalida esa convención de confiabilidad; se debe contrastar con el cálculo de los perfiles de entrada.

## Definiciones operativas ya recibidas

**Conveyors — confirmado el 27 de octubre de 2026:** se asumen sin fallas propias dentro de este modelo. No tratarlos como equipos con confiabilidad faltante ni inventar MTBF/MTTR. Conservan su dinámica de transporte y los paros por falta de material, bloqueo, sensores y órdenes. Un perfil de fallas existente se conserva como excepción explícita; desactivarlo requiere una decisión del usuario. La confirmación no se extiende automáticamente a todos los equipos CUSTOM o a cualquier equipo auxiliar.


MTTR: desde la detención hasta el fin de reparación. Las máquinas descritas generalmente reinician sin rampa; el motor conserva rampas tras reparación desactivadas por defecto y permite excepciones explícitas por equipo.

El texto sobre rampas posteriores a changeover no cambia esa definición ni justifica activar rampas después de todas las reparaciones.

## Acciones posteriores a las confirmaciones

1. Alinear velocidad estándar, producto bueno y punto de medición.
2. Mantener separadas las métricas de salida existentes y la contabilidad AEM del cuello de botella o línea, según la definición confirmada.
3. Reproducir calendario y causas de paro faltantes; no agregar downtime total si ya está representado por MTBF/MTTR.
4. Repetir las rondas y comparar AE, AU, OE, RE, producción y pérdidas con denominadores consistentes.
5. Calibrar únicamente parámetros sustentados en evidencia.

Los datos observados continúan como referencia comparativa. Esta actualización es documental: no modifica el motor, los parámetros del caso ni la interfaz.

## Registro de respuestas

| Tema | Estado / evidencia | Responsable | Fecha |
|---|---|---|---|
| Fórmulas generales AE/AU/OE/RE | Documentadas: AEM sección V | | 2026-10-27 |
| Runtime / Effective Runtime | Documentados: sección IV.D–F | | 2026-10-27 |
| Velocidad estándar / pérdidas | Documentadas: sección IV.E | | 2026-10-27 |
| Changeover / rampa posterior | Documentados: sección IV.C | | 2026-10-27 |
| Origen de los valores | Base de datos de planta; hoja de presentación, confirmado por el usuario | | 2026-10-27 |
| Conciliación de campos y lógica del reporte | Pendiente; conceptos AEM ya documentados | | |
| UPDT% | Pendiente: no definido en esta referencia | | |
| Calendario y eventos del Caso C | Pendiente | | |
| Perfiles MTBF/MTTR y excepciones | Pendiente, salvo MTTR y reinicio sin rampa ya recibidos | | |

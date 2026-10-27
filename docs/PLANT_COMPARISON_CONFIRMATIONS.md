# Confirmaciones para comparar planta y simulación

Actualizado: 27 de octubre de 2026. Estado: definiciones AEM documentadas; aplicación a las celdas del Caso C pendiente de validación.

## Fuentes y alcance

Se revisaron las dos series de fotografías aportadas el 27 de octubre: secciones I–X y figuras 1–5 del documento AEM, identificado en el pie visible como TIL 97-015, 14 de julio de 1997. Las definiciones siguientes proceden de sus secciones IV y V; las diferencias con OEE, de la sección VII y figura 5.

La referencia aclara el modelo documental. No prueba por sí sola que la hoja actual aplique exactamente esas fórmulas. Las fotografías y el texto íntegro no se incorporan al repositorio; se resume lo necesario para esta comparación.

Ver también [referencia AEM](ASSET_EFFECTIVENESS_MODEL.md).

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

La reconstrucción explica los 366 y 52 minutos redondeados: la celda rotulada “Run Time” parece contener T5, y no T4. Es una inferencia aritmética, no una confirmación de su fórmula. Si existen scrap o reproceso, los 51.89 minutos son pérdidas totales en marcha; no se asignan íntegramente a velocidad sin separar esos componentes.

El documento no resuelve tres discrepancias de la hoja:

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

### Prioridad 1 — Hoja, referencia y punto de medición

- [ ] Obtener fórmulas de las celdas AU, UPDT%, Run Time, Rate Loss y Production Available Time, con sus valores sin redondear.
- [ ] Verificar qué significa AU en esta hoja y por qué no coincide con T5/T2 del documento.
- [ ] Identificar numerador y denominador de UPDT%; no asumir que es 286/704.
- [ ] Resolver 704 frente a 705 minutos.
- [ ] Confirmar si “Run Time” está mal rotulado y contiene Effective Runtime.
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
- [ ] Confirmar si los transportadores no presentan fallas propias o si faltan sus datos.

El reloj del motor actual avanza en pasos con procesamiento positivo. La referencia AEM aportada no valida ni invalida esa convención de confiabilidad; se debe contrastar con el cálculo de los perfiles de entrada.

## Definición operativa ya recibida

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
| Fórmulas y etiquetas de la hoja actual | Pendiente | | |
| UPDT% | Pendiente: no definido en esta referencia | | |
| Calendario y eventos del Caso C | Pendiente | | |
| Perfiles MTBF/MTTR y excepciones | Pendiente, salvo MTTR y reinicio sin rampa ya recibidos | | |

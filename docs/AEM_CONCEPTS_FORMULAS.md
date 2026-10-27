# Compendio AEM: conceptos, fórmulas y ejemplos

Actualizado: 27 de octubre de 2026.

Referencia estable para interpretar los indicadores del proyecto. Antes de modificar cálculos o comparar datos de planta, consultar este compendio y [las confirmaciones pendientes](PLANT_COMPARISON_CONFIRMATIONS.md). Las propuestas y revisiones históricas de implementación están en [Asset Effectiveness Model](ASSET_EFFECTIVENESS_MODEL.md).

## Procedencia y alcance

Síntesis de las fotografías aportadas de las secciones I–X y figuras 1–5 del documento AEM, identificado en el pie visible como TIL 97-015, 14 de julio de 1997. Se resumen conceptos y se verifican ejemplos; no se reproduce el documento íntegro ni se incorporan las fotografías.

Las fórmulas AEM están documentadas. La conciliación de los registros del Caso C es un trabajo distinto: sus datos provienen de bases de datos de planta y la hoja es un medio de presentación. No se deben solicitar fórmulas de celdas como si allí se originaran los indicadores.

## 1. Los cinco tiempos

| Símbolo | Concepto | Fórmula |
|---|---|---|
| T1 | Total Available Time | Tiempo calendario del período |
| T2 | Plant Available Time | T1 − Business / External Downtime |
| T3 | Production Available Time | T2 − Plant Decision Downtime |
| T4 | Runtime | T3 − Unplanned Downtime |
| T5 | Effective Runtime | T4 − Runtime Losses |

Identidad de balance, con categorías excluyentes:

```text
T1 = Business / External Downtime
   + Plant Decision Downtime
   + Unplanned Downtime
   + Runtime Losses
   + T5
```

T1–T4 representan presupuestos de tiempo del período; T5 es tiempo equivalente de producción conforme. Todos deben expresarse en la misma unidad antes de operar.

### Clasificación de pérdidas

| Categoría | Contenido descrito |
|---|---|
| Business / External | Pruebas externas de I+D, falta de demanda, festivos, interrupciones externas de servicios y clima que afecta al sitio |
| Plant Decision | Mantenimiento planificado, changeover, limpieza/sanitización, reuniones/capacitación, descansos y experimentación originada por planta |
| Unplanned Downtime | Averías, reparaciones de seguridad imprevistas, sobretiempo de mantenimiento programado, faltantes de proceso/material o personal y problemas operativos no planificados |
| Runtime Losses | Scrap, reproceso y Production Rate Losses, convertidos a tiempo equivalente |

No confundir falta de demanda con falta imprevista de material. La clasificación responde a la causa y al contexto. Un total de paro no permite deducir cuántas fallas ocurrieron ni sus MTBF/MTTR.

## 2. Velocidad estándar y tiempo equivalente

La sección IV.E define Standard Rate como la máxima velocidad instantánea del equipo cuello de botella para cada SKU o fórmula. Distinguirla de la consigna habitual, la media observada y la capacidad máxima aislada de otro equipo.

Para un formato y una velocidad constante:

```text
T5 = producción buena / velocidad estándar
Tiempo equivalente de scrap = unidades de scrap / velocidad estándar
Tiempo equivalente de reproceso = unidades reprocesadas / velocidad estándar
Runtime Losses = T4 − T5
```

Para varios formatos: T5 = suma de producción buena de cada formato / su velocidad estándar. Alinear unidades: cajas con cajas/h; botellas con botellas/min. El reproceso consume capacidad adicional y debe contabilizarse sin duplicar la producción buena final.

**Ejemplo del documento:** 75,000 cajas / 250 cajas/h = 300 horas de línea = 12.5 días de línea. No significa que la línea haya estado encendida únicamente 300 horas.

Production Rate Losses es el componente de velocidad de Runtime Losses. Solo se puede identificar con toda la diferencia T4−T5 cuando no existen otras pérdidas en marcha o ya se separaron scrap y reproceso. Las fotografías no prescriben un algoritmo por paso de pérdida bruta y recuperación.

## 3. Los cuatro indicadores AEM

| Indicador | Fórmula en porcentaje | Interpretación |
|---|---|---|
| Asset Effectiveness — AE | 100 × T5 / T1 | Producción equivalente respecto al calendario completo |
| Asset Utilization — AU | 100 × T5 / T2 | Producción equivalente respecto al tiempo disponible de planta |
| Operating Efficiency — OE | 100 × T5 / T3 | Desempeño durante el tiempo disponible para producir |
| Runtime Efficiency — RE | 100 × T5 / T4 | Desempeño de velocidad y calidad durante Runtime |

**AU está definido y ejemplificado en la información aportada. No mantenerlo como una definición general pendiente.** Lo que puede estar pendiente es la conciliación de un valor particular extraído de la base de planta.

Si un denominador es cero o desconocido, el indicador no es calculable; no asignar cero por defecto. Con bases consistentes y pérdidas no negativas: T1 ≥ T2 ≥ T3 ≥ T4 ≥ T5 y AE ≤ AU ≤ OE ≤ RE.

Para consolidar períodos o líneas, dividir sumas de tiempos equivalentes entre sumas de sus denominadores. No promediar porcentajes sin ponderar. Para réplicas del mismo escenario se puede mostrar la media de los indicadores por ronda; la ronda representativa no sustituye esa media.

## 4. Ejemplos verificados de las fotografías

### Figura 3: reporte mensual, total de dos líneas

La unidad es días de línea. Dos líneas durante 31 días dan 62 días de línea en total; no representan un mes calendario de 62 días.

| Tiempo | Días de línea |
|---|---:|
| T1 | 62.00 |
| T2 | 18.84 |
| T3 | 9.05 |
| T4 | 6.73 |
| T5 | 6.73 |

| Indicador | Operación con valores mostrados | Resultado |
|---|---|---:|
| AE | 100 × 6.73 / 62.00 | 10.9 % |
| AU | 100 × 6.73 / 18.84 | 35.7 % |
| OE | 100 × 6.73 / 9.05 | 74.4 % |
| RE | 100 × 6.73 / 6.73 | 100.0 % |

Aquí Runtime y Effective Runtime coinciden porque las pérdidas en marcha se muestran como cero. No generalizar esa igualdad a todos los casos.

### Figura 5: comparación AEM y OEE

| Tiempo AEM | Días de línea |
|---|---:|
| T1 | 365.00 |
| T2 | 309.76 |
| T3 | 287.95 |
| T4 | 203.54 |
| T5 | 202.87 |

| Indicador | Operación con valores mostrados | Resultado |
|---|---|---:|
| AE | 100 × 202.87 / 365.00 | 55.6 % |
| AU | 100 × 202.87 / 309.76 | 65.5 % |
| OE | 100 × 202.87 / 287.95 | 70.5 % |
| RE | 100 × 202.87 / 203.54 | 99.7 % |

Los totales impresos pueden contener redondeos. Para conciliaciones precisas, conservar valores originales sin redondear y una tolerancia explícita.

## 5. OEE y AEM

```text
OEE = Availability × Performance × Quality
```

Usar razones entre 0 y 1 y multiplicar el producto final por 100 para expresarlo en porcentaje.

La figura 5 utiliza para OEE un tiempo disponible de 299.49 días, frente a T3 AEM de 287.95 días. La diferencia es setup de 11.54 días: en ese ejemplo OEE lo cuenta como paro no planificado; AEM lo descuenta como Plant Decision.

Por eso el ejemplo muestra OEE de 67.7 % y OE AEM de 70.5 % para la misma producción efectiva. AU no es OEE. OE solo coincide con OEE cuando denominador, calidad, velocidad, período y frontera de conteo coinciden.

## 6. Changeover, rampas y downtime de línea

Changeover AEM: desde la última unidad buena A hasta la primera unidad buena B; incluye pruebas y ajustes para obtener producto vendible. La rampa posterior hasta velocidad estándar se registra aparte como pérdida de rendimiento.

El ejemplo de figura 1 registra 395 minutos de changeover y, después, un atasco de 8 minutos como Unplanned Downtime separado. Su descripción de arranque a máxima velocidad no modifica la definición formal de primera unidad buena.

El ejemplo de paro no planificado usa una ventana de 720 minutos, 123 minutos de paro que afectan al cuello de botella y 597 minutos de funcionamiento. Las causas pueden estar en otros equipos; no sumar sus duraciones como si fueran tiempo exclusivo adicional de línea.

Los acumuladores pueden mantener la salida cuando el cuello de botella se detiene, o provocar salida superior a la referencia al descargarse. Por ello, flujo positivo en la salida final y Runtime AEM no son automáticamente la misma medición.

## 7. MTBF/MTTR: convención operativa del proyecto

Las fotografías AEM no definen el reloj ni la distribución de MTBF/MTTR. Separar lo siguiente de sus fórmulas documentales:

- La confirmación operativa recibida indica MTTR desde detención hasta fin de reparación y reinicio generalmente sin rampa para las máquinas descritas.
- Las rampas tras reparación están desactivadas por defecto; excepciones explícitas por equipo.
- El reloj del motor continuo 0.17.6 avanza en pasos con procesamiento positivo; su correspondencia con los perfiles de entrada debe verificarse.
- Una rampa posterior a changeover no implica que cada reparación requiera rampa.

## 8. Reglas para el análisis y los cambios del simulador

1. Conservar separados los valores reportados por la base de planta, los recalculados bajo AEM y los simulados.
2. No afirmar que un dato de planta está equivocado solo porque no coincide con una reconstrucción provisional.
3. No sustituir los porcentajes reportados ni alterar MTBF/MTTR para forzar coincidencia de producción.
4. Declarar velocidad estándar, período, producto bueno, formato y punto de conteo.
5. Separar pérdida total equivalente T1−T5, paro no planificado T3−T4 y pérdidas en marcha T4−T5.
6. No identificar automáticamente los contadores de salida final del motor con los tiempos AEM del cuello de botella.
7. El documento no define UPDT%; la lógica de ese campo del reporte sigue pendiente.
8. Aplicar la jerarquía y los ejemplos como referencia para cualquier futura implementación; este archivo no modifica por sí mismo el código.

Las discrepancias y solicitudes concretas del Caso C se mantienen en [PLANT_COMPARISON_CONFIRMATIONS.md](PLANT_COMPARISON_CONFIRMATIONS.md).

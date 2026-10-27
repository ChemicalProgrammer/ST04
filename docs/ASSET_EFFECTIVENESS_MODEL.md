# Asset Effectiveness Model (AEM): referencia y aplicación en SimuLine

Fecha: 2026-10-23. Estado: referencia documentada y propuesta de integración; no implementa cambios en cálculos, interfaz ni importadores.

## 1. Propósito y procedencia

Referencia organizada a partir de las tres imágenes del documento `resumen-asset-effectiveness-model (1).md` compartidas para este proyecto. No se dispone del Markdown original ni de una versión normativa del modelo. Las secciones 2–4 recogen su contenido; las secciones siguientes son análisis y propuesta para el simulador.

Archivos fuente: `image-1792774659773.jpg`, `image-1792774675221.jpg` e `image-1792774690634.jpg`. Esta referencia conserva el contenido textual y matemático visible; no incorpora las fotografías al repositorio.

El Asset Effectiveness Model analiza las operaciones de manufactura y la utilización de los activos. Sus propósitos son:

- Identificar causas de utilización ineficiente y oportunidades de mejora.
- Estandarizar metodología y lenguaje para seguimiento, capacidad futura y comparación entre plantas.
- Relacionar indicadores de manufactura con objetivos financieros, de clientes, personas y medioambiente, y con servicio, flexibilidad, productividad, calidad y costos.

## 2. Jerarquía de los cinco tiempos

La referencia usa el calendario completo, 365 días por 24 horas, como horizonte anual. Para un día, turno o mes se debe usar el calendario del período correspondiente; no se asignan automáticamente 8,760 horas a cualquier observación.

| Nivel | Nombre | Definición / identidad |
|---|---|---|
| T1 | Total Available Time | Tiempo calendario total del período. |
| T2 | Plant Available Time | T1 − Business / External Downtime. |
| T3 | Production Available Time | T2 − Plant Decision Downtime. |
| T4 | Runtime | T3 − Unplanned Downtime. |
| T5 | Effective Runtime | T4 − Runtime Losses. |

| Categoría descontada | Ejemplos visibles en la referencia |
|---|---|
| Business / External Downtime | Pruebas I+D, falta de demanda, festivos, servicios externos y fallos de servicios públicos externos. |
| Plant Decision Downtime | Mantenimiento planificado, cambios de formato/producto, sanitización/limpieza, reuniones, capacitaciones y descansos. |
| Unplanned Downtime | Averías, falta imprevista de materiales y falta de personal / problemas operativos de personal. |
| Runtime Losses | Scrap, reproceso y pérdidas de velocidad, expresados como tiempo equivalente. |

La referencia presenta I+D como exclusión externa; el calendario actual tiene `experimentationMinutes` entre decisiones de planta. Se necesita una clasificación explícita según el motivo del evento, sin trasladar automáticamente toda experimentación a una categoría.

Effective Runtime es tiempo equivalente de producción conforme a la velocidad estándar y con calidad al 100%; no es necesariamente un intervalo continuo del reloj. Con un solo formato y una referencia constante:

```text
T5 [s] = goodOutput [unidades] / standardRate [unidades/s]
Runtime losses [s equivalentes] = T4 − T5
```

La unidad de salida y la velocidad deben coincidir. Para varios formatos, sumar los tiempos equivalentes por formato usando sus respectivas velocidades estándar. La referencia de velocidad debe estar declarada y versionada; no se sustituye silenciosamente por la velocidad media observada.

## 3. Indicadores de la referencia

Todos se presentan en porcentaje multiplicando la razón por 100.

| Indicador | Fórmula | Uso descrito |
|---|---|---|
| Asset Effectiveness (AE) | T5 / T1 | Aprovechamiento frente al calendario completo; tendencia de largo plazo. |
| Asset Utilization (AU) | T5 / T2 | Aprovechamiento del tiempo disponible de planta; tendencia de largo plazo. |
| Operating Efficiency (OE) | T5 / T3 | Indicador principal mensual del desempeño durante el tiempo planificado para producir. |
| Runtime Efficiency (RE) | T5 / T4 | Desempeño de velocidad y calidad mientras la línea está en marcha. |

Un denominador nulo, desconocido o cero produce un indicador no calculable, no un cero por defecto.

Como identidad derivada de estas fórmulas, cuando todos los denominadores son positivos y comparten alcance:

```text
AE = (T2 / T1) × (T3 / T2) × (T4 / T3) × RE
AU = (T3 / T2) × (T4 / T3) × RE
OE = (T4 / T3) × RE
```

Estas identidades usan razones entre 0 y 1. Con tiempos coherentes, AE ≤ AU ≤ OE ≤ RE.

## 4. Relación con OEE

La referencia describe OEE como producción conforme a velocidad de diseño durante el tiempo programado para operar. Las páginas adicionales revisadas el 27 de octubre (sección VII y figura 5) precisan una excepción: setup se conserva como Unplanned Downtime en OEE, mientras AEM lo clasifica en Plant Decision. Por ello, excluir las decisiones de planta no garantiza que ambos denominadores sean iguales. AEM amplía el análisis al calendario completo y a la capacidad no utilizada por causas de negocio.

Por las fórmulas aportadas, OE podría coincidir numéricamente con OEE si ambos utilizan exactamente el mismo T3, velocidad estándar, calidad, unidades y frontera de producción. Esta es una condición matemática, no una equivalencia automática con el OEE guardado actualmente por SimuLine. AU tampoco debe renombrarse OEE.

## 5. Revisión del estado actual del repositorio

Revisión de `main` al preparar este documento:

| Componente | Funcionalidad existente | Consecuencia para AEM |
|---|---|---|
| `apps-script/PlantCalendar.html` | Total, exclusiones externas, decisiones, tiempo disponible de producción y AU proyectado. | Base para T1–T3; revisar definición de T5 y referencia del OEE empleado. |
| `src/simulation/PlantCalendarSchedule.js` | Siete categorías de paros físicos, horizonte ajustado, validación de solapes y eventos programados. | Base para exclusiones planeadas; no genera por sí sola toda la contabilidad AEM. |
| `apps-script/RealData.html` | Captura/importación JSON de tiempos, eficiencia reportada y datos por equipo; comparación de rondas. | Base para conservar observaciones AEM con una definición explícita. |
| `examples/real-data-template.json` | Incluye `reportedEfficiencyPercent`, `updtSeconds`, runtime, tiempo efectivo y pérdidas equivalentes. | Campos existentes no bastan para identificar todos los denominadores AEM. |
| `apps-script/SheetImportService.gs` | Importa metadata y equipos; deja fuera el resumen desde “Total Time”. | El resumen AU/UPDT de la hoja aún requiere un importador específico. |

Referencias relacionadas: [calendario](PLANT_CALENDAR.md), [comparación](REAL_DATA_COMPARISON.md), [formato Sheets](SHEET_FORMAT_V2.md) y [registro diario Caso C](CASE_C_DAILY_PRODUCTION.md).

### 5.1 Diferencia crítica: UPDT

La jerarquía AEM aportada ubica **Unplanned Downtime entre T3 y T4**:

```text
Unplanned downtime AEM = T3 − T4
```

Las imágenes no especifican una fórmula de UPDT%, ni confirman que una etiqueta “UPDT” de otros reportes utilice siempre ese significado.

El comparador actual, bajo `lineTimeBasis = OUTPUT_FLOW`, calcula:

```text
updtSeconds simulado = duración completa − tiempo efectivo
```

Ese valor incluye pérdidas planeadas y pérdidas equivalentes de velocidad/calidad; es una pérdida total equivalente y no debe compararse automáticamente con el paro no planificado AEM. Además, runtime por flujo positivo a la salida es una definición actual del comparador; no queda validada como T4 AEM solo con estas imágenes.

Mantener separados:
- UPDT reportado por la fuente, con su definición pendiente o confirmada.
- Unplanned downtime AEM = T3 − T4.
- Pérdida total equivalente del comparador anterior = duración − T5.
- Pérdidas en marcha = T4 − T5.

### 5.2 Calendario y doble descuento

En modo agregado, el calendario proyecta T5 como tiempo disponible de producción × OEE medio. En modo programado, utiliza duración física × OEE medio porque la producción ya contiene el efecto de los paros planeados.

Para una futura contabilidad AEM, derivar preferentemente T5 desde producción conforme y velocidad estándar confirmadas. Restar dos veces los paros planeados produciría un indicador incorrecto. El horizonte físico programado actual excluye tiempo externo y `coReportingErrorMinutes`; no equivale automáticamente al calendario T1.

`coReportingErrorMinutes` es hoy una exclusión positiva. No hay en las imágenes una categoría AEM equivalente ni regla de signo; conservarla como ajuste de reporte explícito hasta definir su tratamiento.

## 6. Propuesta para importar y comparar posteriormente

### 6.1 Contrato de datos propuesto

Extender la observación de producción con un bloque AEM versionado. Los siguientes nombres son **propuestos y aún no son campos soportados por el importador**:

| Campo propuesto | Unidad / significado |
|---|---|
| `aem.definitionVersion` | Versión de las definiciones aplicadas. |
| `aem.periodStart`, `aem.periodEnd`, `aem.timeZone` | Período y zona horaria. |
| `aem.totalAvailableSeconds` | T1. |
| `aem.businessExternalDowntimeSeconds` | Exclusión externa. |
| `aem.plantAvailableSeconds` | T2. |
| `aem.plantDecisionDowntimeSeconds` | Decisiones de planta. |
| `aem.productionAvailableSeconds` | T3. |
| `aem.unplannedDowntimeSeconds` | Paro no planificado AEM. |
| `aem.runtimeSeconds` | T4. |
| `aem.runtimeLossSeconds` | Pérdidas equivalentes durante runtime. |
| `aem.effectiveRuntimeSeconds` | T5. |
| `aem.reportedAssetEffectivenessPercent` | AE informado por la fuente. |
| `aem.reportedAssetUtilizationPercent` | AU informado por la fuente. |
| `aem.reportedOperatingEfficiencyPercent` | OE informado por la fuente. |
| `aem.reportedRuntimeEfficiencyPercent` | RE informado por la fuente. |
| `aem.reportedUpdtSeconds` | UPDT conservado tal como se reporta. |
| `aem.updtDefinition` | UNCONFIRMED / AEM_UNPLANNED / TOTAL_EQUIVALENT_LOSS. |
| `aem.reportedUpdtPercent`, `aem.updtPercentDenominator` | Porcentaje informado y denominador explícito; no asumir T1, T2 o T3. |
| `aem.runtimeDefinition` | Regla confirmada para decidir cuándo la línea está en marcha. |
| `aem.outputBasis` | GOOD / GROSS / UNCONFIRMED. |
| `aem.standardRateBasis` | Referencia de velocidad y unidad; por formato si corresponde. |
| `aem.sourceFields` | Rótulos, valores originales, unidades y celdas de origen. |

Conservar `null` para desconocido y cero para un cero informado. Mantener separados valores reportados, recalculados y simulados; si discrepan, mostrar ambos y la diferencia.

La migración debe preservar `reportedEfficiencyPercent` y `updtSeconds` anteriores sin reclasificarlos. Un dato histórico sin definición confirmada permanece sin comparación AEM automática.

### 6.2 Formato de importación

Proponer una pestaña o bloque identificado de indicadores y tiempos, independiente de las columnas de equipos. AU es porcentaje y UPDT puede ser tiempo o porcentaje: la unidad debe ser obligatoria en el contrato.

- Preview debe permitir seleccionar campos y observación destino, mostrando período, unidad y celda fuente.
- Importar observaciones no debe modificar MTBF/MTTR, velocidades, eventos ni resultados simulados.
- Aplicar tiempos como calendario físico sería una acción separada y explícita.
- Exportar la plantilla con todos los campos y ejemplos identificados, preservando compatibilidad con los formatos actuales.
- No convertir totales UPDT en MTBF/MTTR: un total no determina frecuencia, duración ni distribución de los eventos.

### 6.3 Comparación en Real data

Mostrar por fila: indicador, valor reportado, valor recalculado desde tiempos, promedio simulado, diferencia, unidad y base de cálculo.

- Diferencias de porcentajes: puntos porcentuales, simulado − observado.
- Diferencias de tiempos: misma unidad seleccionada; conservar segundos internamente.
- Comparar el mismo período, línea, formato, velocidad estándar, calidad y frontera de salida.
- Para réplicas del mismo horizonte: calcular cada KPI por ronda y mostrar media, dispersión y número de rondas. La ronda representativa no sustituye la media.
- Para períodos con diferentes denominadores: usar sumas de numeradores y denominadores para el KPI consolidado; no promediar porcentajes sin ponderación.
- Si falta una definición o denominador, conservar los valores visibles y desactivar su diferencia.
- El motor actual supone ausencia de rechazos en esta comparación. La calidad simulada debe declararse como supuesto; no afirmar validación de scrap/reproceso.

### 6.4 Contabilidad física de línea

El tiempo de fallo acumulado de todos los equipos no es tiempo de paro de línea: los eventos pueden solaparse y los buffers pueden mantener la salida.

Se necesita una regla temporal de estado de línea, consistente con la planta, para obtener T4 y el paro no planificado. Registrar categorías excluyentes y prioridad para eventos simultáneos; conservar aparte las causas por equipo. Starving y blocking no se suman indiscriminadamente al UPDT de la línea.

La descomposición de velocidad y calidad tampoco debe contar dos veces las mismas pérdidas. Para una referencia constante, puede reconciliarse mediante producción total y conforme, siempre que se disponga de ambas.

## 7. Validaciones y ejemplo de aceptación

Validaciones propuestas:
- T1 ≥ T2 ≥ T3 ≥ T4 ≥ T5 ≥ 0.
- Reconciliar cada resta de la jerarquía con tolerancia explícita por redondeo.
- Validar tiempos finitos, unidades, períodos y velocidades positivas.
- No ocultar inconsistencias recortando indicadores a 0–100%.
- No atribuir una diferencia de AU a confiabilidad sin separar calendario, velocidad y calidad.
- Conservar los valores originales del Caso C; la nueva referencia no resuelve por sí sola los porcentajes discordantes de sus gráficas.

Ejemplo sintético para verificar fórmulas y evitar doble descuento:

| Dato | Valor |
|---|---:|
| T1 | 1,440 min |
| Business / External Downtime | 240 min |
| T2 | 1,200 min |
| Plant Decision Downtime | 200 min |
| T3 | 1,000 min |
| Unplanned Downtime AEM | 100 min |
| T4 | 900 min |
| Runtime Losses | 90 min equivalentes |
| T5 | 810 min equivalentes |
| AE | 56.25% |
| AU | 67.50% |
| OE | 81.00% |
| RE | 90.00% |

En este ejemplo, T1 − T5 = 630 min de pérdida total equivalente, mientras el paro no planificado AEM es 100 min. No son intercambiables.

## 8. Secuencia recomendada de implementación

1. Confirmar significado de UPDT, UPDT%, runtime, velocidad estándar y calidad en el formato que se importará.
2. Versionar el contrato y ampliar plantilla, captura, persistencia y preview de importación.
3. Implementar una función común de contabilidad AEM para observaciones y resultados, con pruebas de las identidades y eventos simultáneos.
4. Incorporar AE/AU/OE/RE y tiempos reconciliados en Real data y reportes.
5. Separar o renombrar la pérdida equivalente actual para evitar confusión con UPDT AEM, preservando los registros anteriores.

La información es aplicable a SimuLine: aporta una base precisa para distinguir pérdidas de calendario, decisiones de planta, paros no planificados y pérdidas de rendimiento. La integración funcional queda pendiente de esas definiciones y del contrato de importación.


## 9. Primera integración implementada — 2026-10-23

La propuesta de integración anterior queda complementada por la implementación de [importación de observaciones desde Sheets](SHEET_REAL_DATA_IMPORT.md). Ese documento define el contrato efectivo, los nombres de campos soportados, las celdas exportadas y las condiciones de comparación. Las tablas de propuestas anteriores no deben interpretarse como una lista de campos ya admitidos.

Se implementaron captura/importación de datos AEM, porcentajes reportados y downtime por equipo, destinos independientes de la configuración física, comparación con valores recalculados y preservación de resultados. Se mantienen pendientes la contabilidad de línea basada en una definición distinta de flujo final y un modelo físico de rechazos/reproceso. No se cambió el motor.


## 10. Ampliación documental — 2026-10-27

Se revisaron las dos series de fotografías adicionales de las secciones I–X y figuras 1–5. El pie visible identifica el documento como TIL 97-015, 14 de julio de 1997. Es una referencia histórica aportada para el proyecto; se debe validar su aplicación en la hoja actual. No se incorporan las fotografías ni una transcripción íntegra al repositorio.

Esta ampliación confirma las fórmulas T1–T5 y AE/AU/OE/RE de las secciones 2–3, y añade las siguientes precisiones:

- **Standard Rate:** máxima velocidad instantánea del equipo cuello de botella para cada SKU o fórmula (IV.E). Validar la referencia usada por el caso; ni la consigna ni la capacidad máxima aislada de otro equipo la determinan automáticamente.
- **Changeover:** última unidad buena A hasta primera unidad buena B, incluyendo pruebas y ajustes para obtener producto vendible. Excluye la rampa posterior a velocidad estándar (IV.C). El ejemplo de figura 1 no sustituye esta definición formal.
- **Runtime Losses:** incluye scrap, reproceso y pérdidas de velocidad. Production Rate Losses es solo velocidad; para aislarla del balance T4−T5 hay que separar las pérdidas de calidad (IV.E).
- **Unplanned Downtime:** incluye también faltantes de proceso/material, personal y problemas operativos; no solo reparaciones (IV.D).
- **Punto de medición:** la figura 1 registra paros que afectan al equipo cuello de botella, con causas que pueden originarse en otros equipos. La salida final positiva del simulador no queda validada automáticamente como Runtime AEM.
- **Experimentación:** distinguir pruebas externas de I+D y experimentación de mejora originada por planta (IV.B–C).
- **OEE:** setup cambia de clasificación entre OEE y AEM; la figura 5 muestra denominadores diferentes. Mantener la condición explícita de equivalencia de la sección 4.

Las imágenes no definen UPDT% ni el reloj o distribución de MTBF/MTTR. Tampoco especifican el algoritmo de pérdida bruta/recuperación por paso utilizado actualmente por el simulador. Las fórmulas generales no validan por sí solas el tratamiento de acumuladores, calidad, fronteras de conteo o períodos con salida superior a la referencia.

### Aplicación provisional al Caso C

Con 80,544 unidades buenas, referencia de 220 unidades/min y tiempos T1=1,440; T2=1,358; T3=704; downtime=286 minutos:

- T4=418 min; T5=366.11 min; pérdidas totales en marcha=51.89 min equivalentes.
- AE=25.42 %; AU=26.96 %; OE=52.00 %; RE=87.59 %.

Estos resultados son condicionales a la referencia de velocidad, calidad y alcance de los tiempos. Los 366 minutos rotulados “Run Time” en la hoja parecen corresponder a T5. El 50.93 % de AU y el 38.85 % de UPDT reportados siguen sin reconciliarse. El cálculo sobre los 704 minutos corresponde a OE, no AU.

El comparativo de producción de 10 rondas mantiene 96,639.28 unidades simuladas frente a 80,544 observadas (+19.98 %). La documentación no permite atribuir automáticamente esa diferencia a velocidad o confiabilidad: primero hay que alinear las mediciones y las causas.

Las preguntas pendientes y los estados actualizados están en [Confirmaciones para comparar planta y simulación](PLANT_COMPARISON_CONFIRMATIONS.md). Esta ampliación no cambia el motor, los importadores ni los indicadores de la interfaz.

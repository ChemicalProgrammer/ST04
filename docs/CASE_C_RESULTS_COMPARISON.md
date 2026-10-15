# Caso C — Comparación y evaluación de resultados

Fecha: 15 de octubre de 2026.

## Conclusión

El simulador reproduce de forma consistente su configuración, pero el Caso C todavía requiere validación contra la operación. Las tres rondas ofrecen resultados muy próximos entre sí; sin embargo, el throughput calculado queda 24.2% por debajo de la referencia bajo el supuesto de turnos de ocho horas y 12 unidades por caja.

El hallazgo prioritario es la coherencia de unidades alrededor de Case Packer y Conveyor PAC-PAL. El archivo conserva un único flujo de “units”, aunque el último conveyor tiene dimensiones compatibles con cajas. Debe confirmarse qué representa cada elemento y modelar su equivalencia con botellas. Esta inconsistencia está identificada; cuánto explica de la diferencia requiere una corrida corregida. No se ha demostrado que sea la única causa.

Conviene mejorar el simulador y continuar la validación. Por ahora, los resultados sirven para revisar entradas y detectar restricciones dentro del modelo. La estimación de beneficios de CAPEX y la atribución de pérdidas por fallas deben esperar a que se resuelvan las unidades y las bases de comparación.

## Base de la comparación

- Resultados: archivo `Case C-complete.json`, Simulation A, motor `ST_CURRENT`.
- Tres rondas completas, semillas 20260909, 20260910 y 20260911.
- Referencias: imágenes del Caso C compartidas para la línea G, envase de 700 ml.
- Conversión provisional indicada por el usuario: **12 unidades por caja**.
- Turno de comparación: **8 horas**, tomado de la configuración; falta confirmar que sea el mismo usado en la referencia.
- El promedio de las tres rondas se utiliza para producción y eficiencia; los detalles de estados, conveyors y balance corresponden a la ronda representativa 1.
- Las conversiones siguientes son aritméticas. No se ha ejecutado una nueva simulación ni modificado el archivo del caso.

## Tabla comparativa

| Concepto | Referencia del Caso C | Simulación / configuración | Observaciones |
|---|---:|---:|---|
| Envase | 700 ml | Equipos importados del Caso C | Confirmar que producción, fallas y calendario correspondan al mismo formato y periodo. |
| Unidades por caja | 12, provisional | Sin conversión botellas/cajas explícita en el caso | La conversión se usa aquí para comparar, pero no está aplicada al motor. |
| Duración del turno | Pendiente de confirmar | 8 h configuradas | Todos los valores por turno de esta tabla suponen 480 minutos. |
| Throughput por turno | 4,489 cajas | **3,405 cajas equivalentes** | 40,858 unidades simuladas ÷ 12. Diferencia: **−24.2%**. Es una normalización del promedio del periodo, no un turno individual observado. |
| Unidades por turno | **53,868** | **40,858** | Referencia: 4,489 × 12. Simulación: 85.12135 × 480. |
| Producción promedio por minuto | **112.23 unidades/min** | **85.12 unidades/min** | Ambas tasas incluyen todo el tiempo del turno supuesto. |
| Velocidad promedio reportada | 220 | Sin comparación directa | Confirmar unidad y denominador: podría ser velocidad mientras la línea corre, mientras que 85.12 incluye paros. |
| Tiempo total | 43,200 min | 43,200 min en Plant Calendar | El horizonte ejecutado se obtiene después de las exclusiones siguientes. |
| Business External Time | 1,441 min | 1,441 min excluidos | Coincide la entrada. |
| Plant Available Time | 41,759 min | Base intermedia de 41,759 min | 43,200 − 1,441. |
| CO Reporting Error | 119 min | 119 min adicionales excluidos | Confirmar si procede descontarlo del horizonte físico o tratarlo como ajuste del reporte. |
| Horizonte ejecutado | Sin equivalente directo confirmado | **41,640 min** | 43,200 − 1,441 − 119; no es el mismo denominador del AU de referencia. |
| Plant Decision Time | 5,393 min | 5,392 min al sumar categorías y CO Reporting Error | Diferencia de 1 min en la referencia; conservar y conciliar. |
| Paros físicos del calendario | 5,273 min al sumar categorías, sin CO Reporting Error | **5,273.06 min** observados | Totales prácticamente iguales; diferencia de 3.75 s por discretización. No demuestra que la ubicación temporal de los eventos sea correcta. |
| Production Available Time | 36,366 min | 36,366.94 min después de los paros programados | La diferencia surge de la conciliación de 1 min y la discretización. |
| Downtime | 10,459 min | Sin equivalente de línea conciliado | No comparar con la suma de fallas de todos los equipos: sus tiempos se pueden superponer. |
| Run Time | 25,907 min | Sin equivalente de línea conciliado | Definir un estado de línea común antes de comparar. |
| AU / Effective Runtime | 21,307 min | **11,814.84 min equivalentes a 300 unidades/min** | La cifra simulada es salida media ÷ 300. La equivalencia con la definición de planta debe confirmarse. |
| AU sobre Plant Available Time | **51.02%** | **28.29%**, recalculado sobre 41,759 min | Se iguala el denominador, pero falta validar que el numerador de planta use la misma velocidad y criterio de calidad. |
| Indicador de eficiencia guardado | No comparable directamente con AU | **28.37%**, sobre 41,640 min | El simulador lo denomina OEE; supone calidad del 100%. Evitar equipararlo automáticamente con AU. |
| Rate Loss Minutes | 4,600 min | Sin equivalente conciliado | Falta separar de forma compatible pérdidas de velocidad, bloqueo, falta de producto y calidad. |
| UPDT | 15,060 min | Sin equivalente conciliado | Referencia: downtime + rate loss = 15,059 min; diferencia de 1 min. Confirmar definición de UPDT. |
| Calidad | No suministrada | **100% asumida** | El caso no contiene un modelo de rechazos; no equivale a calidad medida. |
| Producción total | No suministrada | **3,544,453 unidades**, promedio | No extrapolar las cajas por turno al periodo sin conocer cuántos turnos incluye ese promedio. |
| Rondas | Sin distribución de referencia | **28.3545%, 28.3790%, 28.3879%** | Buena repetibilidad: rango de 0.0335 puntos porcentuales; no demuestra exactitud contra planta. |
| Resultado sin fallas | No suministrado | **30.26%** | Diagnóstico guardado; no es una medición de planta ni una nueva corrida hecha para este documento. |
| Pérdida condicional MTBF/MTTR | Sin atribución causal medida | **1.89 puntos porcentuales** | 30.2590 − 28.3738. Una restricción dominante puede reducir el beneficio aparente de eliminar fallas. |
| Conveyor PAC-PAL | 32.49 m/min; paso 310 mm | **104.81 elementos/min** de capacidad de transferencia | Si los elementos son cajas de 12, equivalen a 1,257.68 botellas/min. Actualmente el flujo no distingue esa equivalencia. No es una predicción de producción efectiva. |
| Acumulación PAC-PAL | 22 s declarados | Capacidad geométrica de **120 elementos** | Confirmar si son cajas y la base de los 22 s. La geometría y la acumulación declarada no deben mezclarse sin una referencia común. |
| Balance de material | No suministrado | Residuo de **0.000533 unidades** en ronda 1 | Cierra numéricamente, contabilizando 56,232.75 unidades de overflow y 856.28 de inventario. Ese overflow requiere validación física. |

### Desglose del calendario

| Concepto | Referencia (min) | Simulado, ronda 1 (min) | Observaciones |
|---|---:|---:|---|
| Changeover | 572 | 572 | 6 eventos configurados; frecuencia pendiente de confirmar. |
| C&S | 2,433 | 2,433 | 30 eventos configurados; frecuencia pendiente de confirmar. |
| Autonomous Maintenance | 0 | 0 | Sin eventos. |
| Planned Maintenance | 1,364 | 1,364 | 4 eventos configurados; frecuencia pendiente de confirmar. |
| Lunch & Break | 617 | 617.0625 | 90 eventos; diferencia de discretización de 3.75 s. |
| Meeting & Training | 287 | 287 | 30 eventos configurados; frecuencia pendiente de confirmar. |
| Plant Experimentation | 0 | 0 | Sin eventos. |
| **Total de paros físicos** | **5,273** | **5,273.0625** | CO Reporting Error se excluye de este total. |

Los totales coinciden, pero los 160 eventos son una distribución configurada, no un registro cronológico confirmado de planta. La secuencia puede cambiar la interacción con fallas, acumulación y arranques.

## Información que falta

| Información | Para qué se necesita | Prioridad |
|---|---|---|
| Unidades por caja definitivas y punto exacto de conversión | Definir el flujo a la salida de Case Packer y en PAC-PAL/Palletizer. | Alta |
| Unidad de las velocidades de Case Packer y Palletizer | Confirmar si los 300 son botellas equivalentes/min, cajas/min u otra base. | Alta |
| Duración del turno y cálculo de las 4,489 cajas/turno | Saber qué turnos, periodos y paros incluye el promedio. | Alta |
| Producción total y unidades buenas/rechazadas del mismo periodo | Comparar volumen y calidad directamente. | Alta |
| Definiciones de AU, UPDT, velocidad promedio y velocidad ideal | Igualar numeradores y denominadores. | Alta |
| Sentido contable de CO Reporting Error | Evitar excluir tiempo físico sin justificación. | Alta |
| Frecuencia, duración y ubicación de los eventos | Validar el calendario más allá de sus totales. | Media |
| Base de cálculo de MTBF y distribución de reparaciones | Confirmar si MTBF usa tiempo operativo o calendario y cómo se comportan las fallas. | Media |
| Acumulación útil, sensores y comportamiento del overflow | Validar bloqueos, reinicios y material perdido. | Media |

## Mejoras recomendadas para el simulador

| Mejora | Beneficio esperado | Prioridad / conveniencia |
|---|---|---|
| Definir unidad física por tramo y unidades base por elemento | Mantener botellas como referencia común y representar cajas físicamente en conveyors. Convertir capacidad, inventario y conteos de sensores de forma consistente. | **Primero.** Es la mejora más importante para este caso. |
| Incorporar agrupación en Case Packer | Representar 12 botellas por caja, incluyendo producto incompleto al final. Un factor de equivalencia puede ser una primera etapa; el comportamiento de lotes requiere tratamiento adicional. | Alta; después de confirmar unidades. |
| Mostrar unidad, periodo y denominador junto a cada KPI | Diferenciar unidades/min durante operación, promedio del periodo, cajas/turno, AU y OEE. | Alta. |
| Validar coherencia de entradas antes de ejecutar | Advertir sobre mezcla de unidades, conciliaciones del calendario y capacidad incompatible con el throughput de referencia. | Alta. |
| Añadir comparación contra datos observados | Mostrar diferencia absoluta y relativa con supuestos visibles. Mantener separados los valores observados y calculados. | Alta. |
| Conciliar tiempos a nivel de línea | Comparar downtime, runtime y pérdidas sin sumar estados simultáneos de equipos. | Alta. |
| Separar pérdidas físicas y ajustes contables | Tratar CO Reporting Error conforme a su definición, mostrando las exclusiones del horizonte. | Alta. |
| Revisar sensores, reinicios y overflow con trazas cortas | Comprobar si las frecuentes señales de backup y el material perdido corresponden al proceso. | Media; antes de calibrar CAPEX. |
| Reportar incertidumbre y sensibilidad | Ampliar réplicas y variar parámetros una vez resueltas las unidades. Distinguir variación aleatoria de incertidumbre de entradas. | Posterior a la corrección física. |

No conviene ajustar MTBF, MTTR o velocidades únicamente para forzar el 51.02%. Primero deben corregirse las definiciones y después contrastar el resultado con producción independiente.

## Fortalezas actuales

- **Réplicas con semillas identificables:** permiten medir repetibilidad y reproducir una ejecución.
- **Entradas y resultados trazables:** el caso conserva equipos, calendario, configuración y diagnóstico.
- **Calendario integrado:** los paros observados reproducen los totales configurados con una diferencia de pocos segundos.
- **Restricciones físicas explícitas:** velocidad, paso y capacidad de conveyors permiten localizar inconsistencias que un cálculo global de disponibilidad no detectaría.
- **Estados por equipo y diagnóstico de conveyors:** ofrecen evidencia para investigar bloqueo, falta de producto, fallas y arranques.
- **Balance de material:** permite distinguir salida, inventario y overflow; el cierre numérico es muy pequeño en la ronda revisada.
- **Comparación con y sin fallas:** es una herramienta útil para estudiar sensibilidad una vez validado el flujo.

Estas fortalezas apoyan la depuración y futura validación del modelo. Su valor actual está demostrado como herramientas de análisis; la exactitud de la predicción de planta continúa pendiente.

## Siguiente prueba recomendada

1. Confirmar unidades por caja, velocidades posteriores al empaque y base del throughput por turno.
2. Implementar y verificar la equivalencia de unidades con pruebas de conservación de material y capacidad.
3. Probar el flujo sin fallas ni eventos para revisar límites físicos; después activar calendario y finalmente fallas.
4. Repetir el Caso C y comparar producción total, cajas/turno y tiempos bajo las mismas definiciones.
5. Validar con otro periodo antes de usar el modelo para estimar beneficios de escenarios.

## Fuentes y alcance

Imágenes del Caso C y `Case C-complete.json` proporcionados para esta revisión. Código local revisado: `apps-script/SimulationEngine.html`, resolución de conveyors y capacidad de transferencia. No se adjunta el JSON completo porque incluye información de cuenta y no es necesario para documentar los hallazgos. No se cambió código del simulador.

# Confirmaciones para comparar planta y simulación

Actualizado: 27 de octubre de 2026. Estado: pendiente de validación con los responsables de los indicadores.

## Objetivo

Alinear las definiciones, los tiempos y las condiciones de operación antes de calibrar el simulador. No modificar MTBF, MTTR o velocidades únicamente para hacer coincidir la producción final.

## Punto de partida

La comparación disponible corresponde al Caso C, motor continuo 0.17.6 y promedio de 10 rondas. La corrida de 704 minutos representa una ventana continua disponible para producir; todavía no reproduce las ventanas de paro del día completo.

| Dato | Referencia de planta | Simulación de 704 minutos |
|---|---:|---:|
| Producción, unidades | 80,544 | 96,639.28 |
| Cajas de 12 unidades | 6,712 | 8,053.27 equivalentes |
| Tiempo equivalente a 220 unidades/min | 366.11 min | 439.27 min |
| Eficiencia sobre 704 min y 220 unidades/min | 52.00 % recalculado | 62.40 % |
| AU declarado | 50.93 % | Pendiente de alinear fórmula |
| UPDT declarado | 38.85 % | Pendiente de alinear fórmula |

La diferencia de producción es +16,095.28 unidades (+19.98 %). Es una diferencia observada; por sí sola no identifica la causa ni demuestra un error del motor.

## Preguntas prioritarias

### 1. Balance de tiempos y calendario

- [ ] Obtener los valores sin redondear y las fórmulas de las celdas de tiempo.
- [ ] Resolver: 1,440 − 82 = 1,358 min; 1,358 − 654 = **704 min**, mientras Production Available Time muestra **705 min**.
- [ ] Confirmar que Downtime 286 + Run Time 366 + Rate Loss 52 = 704 min es el balance previsto y que las categorías son excluyentes.
- [ ] Obtener inicio, fin y motivo de las ventanas de Business External (82 min) y Plant Decision (654 min), incluyendo sus posibles solapamientos.
- [ ] Confirmar qué equipos se detienen en cada ventana, si los transportadores siguen descargando y qué sucede con el producto acumulado.

**Efecto:** permite reproducir el día completo y sus reinicios. La ubicación de los paros puede cambiar el resultado frente a una ventana continua de 704 minutos.

### 2. Fórmulas de AU y UPDT

- [ ] Solicitar fórmula exacta, numerador, denominador, exclusiones y velocidad de referencia de AU.
- [ ] Solicitar la misma información para UPDT y confirmar si Downtime es su numerador completo.
- [ ] Confirmar si se emplean tiempos o velocidades diferentes por turno o formato.

**Comprobaciones pendientes:** 80,544 ÷ (220 × 704) = 52.00 %, distinto de AU 50.93 %. Asimismo, 286 ÷ 704 = 40.63 %, distinto de UPDT 38.85 %. No sustituir los indicadores declarados por estas fórmulas hasta confirmar su definición.

### 3. Run Time y Rate Loss

- [ ] Confirmar si los 366 min de Run Time son tiempo equivalente de producción: 80,544 ÷ 220 = 366.11 min.
- [ ] Confirmar cómo se mide el tiempo real con salida de producto. Si el balance es el indicado, podría ser aproximadamente 366 + 52 = 418 min; esto es una hipótesis por validar.
- [ ] Solicitar la fórmula y los datos de origen de los 52 min de Rate Loss.
- [ ] Confirmar si Rate Loss es bruto o neto de recuperaciones sobre la velocidad de referencia.
- [ ] Precisar qué incluye: velocidad reducida, alimentación parcial, microparos, rampas u otras pérdidas; verificar que no se cuenten también en Downtime.
- [ ] Confirmar si la medición procede del equipo de referencia o de la salida final de la línea y con qué resolución temporal.

El simulador distingue:

| Métrica de la corrida de 704 min | Promedio |
|---|---:|
| Tiempo con salida final positiva | 439.57 min |
| Tiempo equivalente de producción | 439.27 min |
| Pérdida bruta de cadencia | 7.00 min |
| Recuperación por salida sobre la referencia | 6.70 min |
| Balance neto de cadencia | 0.30 min |

El balance neto es tiempo con salida menos tiempo equivalente, o pérdida bruta menos recuperación. La salida sobre referencia puede reflejar descarga de acumuladores u otras condiciones; no demuestra por sí sola una mejora sostenida. No comparar los 52 min directamente con una de estas métricas sin alinear las definiciones.

### 4. Downtime de línea y confiabilidad por equipo

- [ ] Confirmar qué causas integran los 286 min de Downtime y cómo se eliminan los solapamientos entre equipos.
- [ ] Obtener número de fallas, duración total y tiempo operativo por equipo para el mismo período; idealmente, el registro de inicio y fin de cada falla.
- [ ] Confirmar si MTBF se mide sobre tiempo procesando producto, equipo habilitado o tiempo transcurrido; aclarar el tratamiento de starvation, blocking y marcha en vacío.
- [ ] Confirmar el umbral exacto de microparo: la documentación inicial menciona menos de 3 o 4 minutos.
- [ ] Aclarar si los perfiles MTBF/MTTR incluyen solo microparos o también fallas mayores. En particular, verificar el alcance del MTTR de 17.26 min del Unscrambler frente al criterio de microparos.
- [ ] Confirmar si los transportadores carecen de fallas propias en el período o si faltan sus datos de confiabilidad. La ausencia de datos no demuestra ausencia de fallas.

**Criterio actual del motor:** el reloj MTBF avanza durante los pasos con procesamiento positivo de producto. No avanza durante espera sin flujo, reparación o paro. Esta convención debe coincidir con la utilizada para calcular los datos de entrada.

No equiparar la suma de duraciones de fallas de equipos con downtime exclusivo de línea: las duraciones pueden solaparse y los acumuladores pueden absorber parte de su efecto. Tampoco agregar los 286 minutos como paros adicionales si ya representan fallas modeladas mediante MTBF/MTTR.

### 5. Velocidad, producto e inventario

- [ ] Confirmar que 220 unidades/min es la referencia para todo el período, distinguirla de la velocidad máxima y registrar cambios de consigna.
- [ ] Confirmar que toda la producción corresponde al mismo formato y a 12 unidades por caja.
- [ ] Confirmar si las 80,544 unidades son producción total o producto bueno; identificar rechazos, reprocesos y pérdidas.
- [ ] Obtener inventario inicial y final de los acumuladores y confirmar dónde se contabiliza la producción.

**Efecto:** el modelo actual supone calidad del 100 %. Diferencias de unidades, velocidad, inventario o punto de conteo pueden alterar producción, eficiencia y recuperación.

## Definición ya recibida

El MTTR se contabiliza desde que la máquina se detiene hasta que termina la reparación. Para las máquinas descritas, el reinicio generalmente no tiene rampa.

El motor conserva por ello las rampas después de reparación desactivadas por defecto, con activación explícita por equipo. Las rampas iniciales y las secuencias de control son independientes. Solo documentar excepciones por equipo; no inferir una rampa a partir de MTBF/MTTR.

## Registro de respuestas

Para cada punto, anotar respuesta, responsable que la confirma, fecha y evidencia (fórmula de celda, definición o registro de eventos).

| Tema | Respuesta confirmada / evidencia | Responsable | Fecha |
|---|---|---|---|
| Balance y calendario | Pendiente | | |
| Fórmulas AU / UPDT | Pendiente | | |
| Run Time / Rate Loss | Pendiente | | |
| Downtime / MTBF / MTTR | Pendiente | | |
| Velocidad / producto / inventario | Pendiente | | |

Con las respuestas, configurar las condiciones equivalentes, repetir las rondas y evaluar la diferencia residual. Los datos observados permanecen como referencia comparativa; cualquier cambio de parámetros requiere una causa documentada.

# Comparación del motor numérico y la simulación 2D

Fecha: 21 de noviembre de 2026. Código revisado: `34b0afe10e5c905e5e168f1fcd0363d02229ad86` de ST04.

**Se reprodujeron diferencias grandes en dos de diez escenarios deterministas.** En los otros ocho, la diferencia absoluta de producción fue menor a 0.26%. Esto no valida ninguno de los motores contra una línea real: comprueba que actualmente no implementan las mismas reglas en todos los casos.

## Método reproducible

```bash
node scripts/compare-numerical-2d.mjs --output=docs/validation/numerical-vs-2d-2026-11-21.json
```

Agregar `--strict` devuelve código 1 si algún escenario supera 1% de diferencia. Ese umbral es diagnóstico, no una tolerancia validada de ingeniería. Los resultados guardados incluyen todas las entradas, las definiciones preparadas del motor 2D, producción, inventario, tiempos por estado y hashes de los archivos principales.

- Se ejecutó `simulateLine`, motor numérico continuo `ST_CURRENT`, y el motor independiente `STSimulation2DEngine`. No se comparó el motor experimental SimPy.
- Cada prueba duró 600 segundos, comenzó vacía, utilizó una sola ronda y desactivó fallas aleatorias. Se habilitó la residencia interna en el numérico, como hace su interfaz.
- Se usaron los pasos de producción de ambas interfaces: 0.25 s en el numérico y 1/120 s en el 2D. La semilla fue 7, pero sin fallas aleatorias no se depende de que los generadores coincidan.
- Ambos recibieron los mismos equipos, velocidades, capacidad interna y geometría resuelta. Para el 2D se ejecutó la función `prepare` real de `Simulation2D.html` y `resolveProfiles` de `ConveyorAnalysis.html` en un contexto sin canvas. Solo se omitieron el dibujo de cotas y la generación de fallas desactivadas.
- La prueba con paro recibió PAUSE a los 120 s y RUN a los 180 s en ambos motores. Las demás no tuvieron eventos.
- Se comprobó conservación de material en los dos motores y suma de tiempos por estado igual a 600 s en cada equipo. Todas esas comprobaciones pasaron.
- Se compararon botellas equivalentes; en la prueba de empaque, también cajas. Se usó la producción real del motor, no el número simbólico de cajas dibujadas en tarimas.

## Resultados

Diferencia = `(numérico / 2D − 1) × 100`. Valores positivos indican mayor producción numérica.

| Escenario | Numérico | 2D | Diferencia | Unidad |
|---|---:|---:|---:|---|
| Dos equipos a 120 bpm | 1128 | 1130 | −0.177% | botellas |
| Cuello de botella, 180 → 120 bpm | 1139.5 | 1141 | −0.131% | botellas |
| V graph, 180 → 120 → 180 bpm | 1111 | 1113 | −0.180% | botellas |
| Conveyor lento; Back-up blocked delay 0.5 s | 669.5888 | 360 | **+85.997%** | botellas |
| Capacidad interna de una botella | 1186 | 1188 | −0.168% | botellas |
| Equipos a 600 bpm, limitados por conveyor | 2948.3 | 2951 | −0.091% | botellas |
| Startup de 1 s y rampa de Prime de 3 s | 808.958333 | 811 | −0.252% | botellas |
| Mismo conveyor lento; blocked delay 0.75 s | 669.5888 | 671 | −0.210% | botellas |
| Paro del equipo final de 120 a 180 s | 1019.5 | 1021 | −0.147% | botellas |
| Empacadora de 12 botellas por caja | 556.25 | 384 | **+44.857%** | cajas |

## Diferencia en Back-up

El conveyor lento mide 2000 mm, transporta botellas de 60 mm con pitch de 100 mm y velocidad de 120 mm/s (7.2 m/min). Back-up está a 300 mm, Prime a 1700 mm, retardo de desbloqueo de 0.5 s, sin respuesta adicional ni botellas residuales al paro. Los equipos trabajan a 180 y 120 bpm, con capacidad interna de 30 botellas cada uno.

Una botella tarda aproximadamente `60 / 120 = 0.5 s` en atravesar el sensor. Con blocked delay de 0.5 s:

- En `Simulation2DEngine.html`, `moveBelt` acumula el retardo cuando la botella tapa el haz, aunque sea producto que está avanzando. En esta prueba el upstream acumuló 274.05 s de Back-up stop y 192.125 s de Blocked.
- En `LineSimulationEngine.js`, `updateBackupSensor` distingue `PULSING` de `BLOCKED`: solo una cola acumulada que cubra el sensor inicia el retardo de bloqueo. El upstream no registró Back-up stop en este escenario.

Cambiar exclusivamente blocked delay a 0.75 s llevó el 2D de 360 a 671 botellas; el numérico permaneció en 669.5888. Este control aísla una discrepancia en las reglas de detección, además de las pequeñas diferencias de discretización.

No se debe resolver agregando un factor de ajuste a la producción. Hay que acordar e implementar una misma definición de obstrucción continua del sensor. El paso lento de un envase puede alcanzar físicamente un retardo; ignorarlo por considerarlo un pulso y tratarlo como obstrucción no son reglas equivalentes.

## Diferencia en formación de cajas y residencia

La línea de empaque tiene fuente de 720 bpm, conveyor de botellas, Case Packer de 60 cajas/min, conveyor de cajas y Palletizer de 60 cajas/min. Cada caja contiene 12 botellas. Fuente y empacadora admiten 30 botellas; palletizer admite 30 cajas. Las residencias preparadas son 2.5 s, 2.5 s y 30 s, respectivamente. Los sensores tienen blocked/clear delay de 0.5 s.

El numérico produjo 6675 botellas equivalentes = 556.25 cajas equivalentes. El 2D produjo 4608 botellas equivalentes = 384 cajas completas. La diferencia no es únicamente la fracción final de una caja.

El código usa políticas diferentes:

- El continuo admite y libera cantidades fraccionarias, incluyendo fracciones de caja. La capacidad y el material se expresan en equivalentes de salida.
- El 2D admite botellas enteras y exige que las 12 botellas de un lote hayan cumplido su residencia antes de liberar una caja. La liberación del lote y el espacio interno disponible afectan las siguientes admisiones.

Con una capacidad pequeña respecto al lote, la espera adicional para completar y madurar un lote puede alterar el régimen de salida, no solo el arranque. En el 2D la empacadora terminó con 408 cajas descargadas, la fuente tuvo 180.758 s de Back-up stop y el palletizer terminó con 384 cajas producidas. El JSON conserva los inventarios intermedios para comprobar ese balance.

Esto demuestra una divergencia de política de procesamiento; no prueba por sí solo cuál describe correctamente el equipo real. Falta homologar la definición de capacidad/residencia y el momento de formación de lote antes de declarar equivalentes los motores. No se modificó el motor para ocultar la diferencia.

## Los tiempos de estado también requieren homologación

Que la producción coincida aproximadamente no significa que los contadores sean intercambiables. En el escenario de dos equipos a 120 bpm:

- El numérico asignó al primer equipo 15 s de STARVED y 585 s de RUNNING durante el llenado inicial de su residencia.
- El 2D asignó 600 s de Running porque considera trabajo interno con material en proceso, aunque todavía no haya salida.

Ambos suman 600 s. La clasificación del llenado y del trabajo parcial difiere. Hay que separar tiempo procesando dentro del equipo, espera de material y tiempo equivalente de producción para comparar disponibilidad y eficiencia sin confundirlos.

## Alcance de esta revisión

Se agregaron la herramienta de comparación y sus resultados. **No se cambiaron archivos de Apps Script ni las reglas de los motores.** No hace falta actualizar Apps Script por esta revisión.

Los siguientes ajustes técnicos deben mantener como controles estos diez escenarios: homologar Back-up; homologar lotes y residencia de Case Packer; homologar contadores de estado. Después corresponde ampliar la matriz a fallas con un calendario de averías idéntico, cambios de formato y los casos específicos del usuario. Estas pruebas no certifican esos escenarios ni comparan promedios de múltiples rondas.

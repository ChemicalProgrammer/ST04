# Homologación del motor numérico y la simulación 2D

Fecha: 21 de noviembre de 2026. Motor principal ST_CURRENT 0.19.0.

**Los diez escenarios deterministas ahora producen exactamente las mismas cantidades en ambos motores.** También se comprobaron conservación de material y suma de tiempos de estado. Esto valida estos escenarios; no certifica todos los casos, calendarios, cambios de formato ni secuencias aleatorias de fallas.

## Reglas aplicadas

- El modo físico que usa la interfaz numérica (`machineResidenceEnabled: true`) cuenta botellas y cajas completas y resuelve posiciones reales de producto. El paso interno es 1/120 s, igual al 2D. El intervalo solicitado de registro se conserva. Las llamadas al modelo fluido antiguo sin modo físico siguen disponibles para compatibilidad.
- El movimiento de paquetes tiene una función compartida entre el numérico y el 2D. Se limita por el espacio de entrada, la velocidad del conveyor y el pitch; el conveyor no añade otro ciclo de procesamiento.
- La conexión interna equipo–conveyor no permite descargar hacia un almacenamiento oculto mientras la entrada real está ocupada.
- Back-up observa obstrucción real, incluyendo el paso lento de una sola unidad. Debe cumplirse el retardo completo; una interrupción reinicia el temporizador. Los sensores siguen temporizando cuando una banda está detenida.
- La empacadora consume unidades enteras y descarga cajas completas. El avance de ciclo se conserva mientras espera espacio de salida; no se obtiene producción fraccionaria de cajas.
- La capacidad interna es un límite de inventario. Ya no se convierte automáticamente en capacidad/velocidad segundos de espera. `Residence time (s)` es opcional y su valor vacío equivale a cero. El ciclo y la residencia mínima son condiciones independientes; se evita sumar artificialmente un segundo ciclo después de cumplir la residencia.
- Trabajar con material dentro, completar un ciclo o cumplir una residencia explícita cuenta como Running. Esperar un lote incompleto sin trabajo cuenta como Starved; tener una unidad terminada sin espacio de salida cuenta como Blocked. Waiting for Prime permanece detallado en el numérico y forma parte de starving en el 2D.
- Los tiempos equivalentes de producción se acumulan sin interpretar cada intervalo entre dos cajas completas como una pérdida instantánea de velocidad.
- Los resultados almacenados y checkpoints anteriores se distinguen por la versión de la política y de la firma de cálculo, para evitar mezclar resultados anteriores con los nuevos.

## Comparación reproducible

```bash
node scripts/compare-numerical-2d.mjs --strict --output=docs/validation/numerical-vs-2d-homologated-2026-11-21.json
```

Cada escenario dura 600 s, empieza vacío y desactiva fallas aleatorias. Se usa una ronda y la misma configuración de equipos, formatos, sensores y órdenes. El script usa el adaptador real de la vista 2D, sin canvas; solo omite el dibujo de cotas y la generación de fallas desactivadas. `--strict` falla si alguna diferencia supera 1%. En esta ejecución todas fueron cero.

| Escenario | Numérico anterior | 2D anterior | Numérico actualizado | 2D actualizado | Unidad |
|---|---:|---:|---:|---:|---|
| Equal rates | 1128 | 1130 | 1188 | 1188 | botellas |
| Downstream bottleneck | 1139.5 | 1141 | 1189 | 1189 | botellas |
| V graph | 1111 | 1113 | 1180 | 1180 | botellas |
| Slow conveyor / blocked delay 0.5 s | 669.5888 | 360 | 375 | 375 | botellas |
| Capacity of one bottle | 1186 | 1188 | 1188 | 1188 | botellas |
| High rate / conveyor limited | 2948.3 | 2951 | 2978 | 2978 | botellas |
| Startup and Prime ramp | 808.958333 | 811 | 986 | 986 | botellas |
| Slow conveyor / blocked delay 0.75 s | 669.5888 | 671 | 700 | 700 | botellas |
| Scheduled downstream pause 120–180 s | 1019.5 | 1021 | 1069 | 1069 | botellas |
| Packer 12 bottles per case | 556.25 | 384 | 590 | 590 | cajas |

Los totales pueden cambiar respecto al caso anterior en ambos motores porque se retiró la residencia automática y se corrigió la política de ciclo. No se ajustaron velocidades, retardos ni parámetros de entrada para forzar la coincidencia.

La clasificación de estados también mejoró: en el caso de velocidades iguales, el primer equipo tiene 600 s de Running en ambos. En el conveyor lento con retardo de 0.5 s, el primer equipo tiene aproximadamente 126.117 s de Running, 195.483 s de Blocked y 278.4 s de Back-up stop en ambos. Los contadores conservan la resolución de cada registro y algunas transiciones pueden diferir por un paso o por la agregación de estados.

## Vista 2D y datos

- Debajo de cada conveyor aparecen dos unidades del modelo seleccionado, con los colores y el estado de botella correspondientes, o dos cajas.
- La cota Width usa el ancho declarado; si no está disponible, usa la dimensión de producto que ya usa el dibujo. Gap muestra la separación libre `pitch − package length`, no el paso entre centros. Las dos cotas están en mm.
- Los dibujos y las cotas se muestran y ocultan junto con Show dimensions. Se reserva espacio antes de las tarjetas para evitar superposición.
- Residence time (s) puede editarse en la tarjeta del equipo y se conserva al guardar el caso.
- Los nuevos archivos de exportación añaden AH: Residence time [s]. La importación reconoce esa columna opcional por su encabezado. Las hojas anteriores siguen admitidas sin ella.

## Validación y límites

- 152 pruebas dirigidas pasaron: física, flujo por formatos, conservación, residencia, conteos enteros de cajas, temporizadores con banda detenida, unidades y colores de las cotas, visibilidad, controles, exportación/importación, bundle de navegador, lotes de simulaciones y reconciliación de tiempo efectivo.
- La matriz comparativa estricta de diez escenarios pasó. El JSON conserva entradas, definiciones, balances, contadores y hashes de las fuentes.
- En la revisión ampliada se detectó una prueba preexistente de calendario que supone que RESUME siempre produce menos que el caso sin paro. Se verificó con el archivo del motor anterior y el actual: ambos dan RESTART=0, RESUME=266 y sin calendario=6.375 para ese fixture. No se modificó el test para ocultarlo.
- Otra comprobación preexistente de controles de confiabilidad compara un objeto vacío con `{equipment:{}}`; usa ConfigurationEditor.html, que no se modificó en este trabajo.
- El motor experimental SimPy no se modificó. Las fallas aleatorias no se homologan solo por compartir una semilla; requieren comparar el mismo calendario de averías.
- El paso físico interno es más fino que el antiguo paso numérico de 0.25 s y aumenta el trabajo de cálculo. La ejecución asíncrona y por workers se conserva; esta revisión no es un benchmark de casos largos.
- Las pruebas de interfaz verificaron las llamadas de dibujo y el control de visibilidad en el entorno de pruebas. No se verificó visualmente una instancia desplegada de Apps Script.

## Archivos que actualizar en Apps Script

1. `SimulationEngine.html`
2. `ScenarioEngine.gs`
3. `Simulation2DEngine.html`
4. `Simulation2D.html`
5. `EquipmentRoles.html`
6. `CaseService.gs`
7. `SheetImportService.gs`
8. `SheetExportService.gs`

Se deben actualizar juntos para que la política de cálculo, los controles y la persistencia sean coherentes.

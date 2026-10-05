# Metodología What-If: hipótesis, búsqueda y validación

## Objetivo

Encontrar cambios factibles que aumenten el throughput sin reducir el OEE de la
línea, conservando el pacemaker de referencia. Una recomendación estática o una
respuesta de Gemini **no demuestra una mejora**. Tampoco se debe juntar todo por
ser técnicamente modificable: cada alternativa compite contra el caso original.

Las categorías siguientes son una política inicial de alcance, no una cotización.
CAPEX y OPEX deben confirmarse en planta. No existe todavía un modelo de costes
que pueda clasificar automáticamente una intervención por su importe.

## Matriz de trabajo

| Familia | Zero CAPEX: equipo instalado | Medium: intervención local | High: cambio de infraestructura | Entradas / variables dinámicas | Evidencia y límites actuales |
|---|---|---|---|---|---|
| Balanceo escalonado / curva V | Ajustar BPM dentro del máximo instalado documentado; mantener el pacemaker | Mejora local de accionamiento, con capacidad confirmada | Sustitución de máquina o capacidad adicional | BPM configurado → producción, blocking y starvation | Se generan objetivos desde V-Graph cuando existen máximo y objetivo calculable. Son velocidades constantes por escenario; **no** un controlador dinámico de sobrevelocidad. No se inventa capacidad disponible. |
| Velocidad de conveyors | Ajuste del belt speed o factor existente | Modificación local de transmisión/control | Rediseño del transporte | m/min / factor → transporte, ocupación y pérdidas de flujo | Puede comparar flujo. No calcula fuerza de contrapresión ni daños a etiquetas/envases. Hace falta un límite operativo medido para aprobar en planta. |
| Sensores y ventanas | Posición Back-up, reserva Prime y retardos de sensores existentes | Añadir sensores o cambiar PLC, previa especificación | Rediseño integral del control | mm y s → estados de acumulación, paro/reinicio, blocking/starvation | Se consideran todos los conveyors con geometría compatible, aunque el diseño inicial pase sus comprobaciones. No se simula PLC arbitrario ni la aceleración mecánica del envase. |
| Acumulación / microparos | Redistribuir reservas dentro de la longitud instalada | Retrofit de buffer, si su geometría está documentada | Extender conveyor o instalar acumulación | Longitudes, pitch, velocidad y tiempos → capacidad efectiva, recuperación y protección del pacemaker | Búsqueda de longitud de diseño por bisección; luego comparación dinámica. El usuario puede limitar, por ejemplo, 20 m a 15 m. La cobertura MTTR estática no prueba ganancia de línea. |
| Fiabilidad externa | No se supone mejora de fiabilidad por mover sensores o acelerar bandas | Mantenimiento, repuestos o recursos de reparación con objetivo justificado | Sustitución con fiabilidad documentada | Aumentar MTBF / reducir MTTR → fallas y reparaciones simuladas | Solo se admiten objetivos externos explícitos con justificación. El formulario permite Medium/High; el coste real exige revisión. Reducir MTBF aumenta las fallas: no es una mejora. |
| Cambio 400 ml / 1 L | Ajuste de receta si ya es compatible | Retrofit de formato | Nuevos equipos/formato fuera de capacidad | Dimensiones, pitch, velocidades y fiabilidad **medidos por formato** | Comparar casos con sus datos específicos. No se generan escenarios automáticos de formato: volumen nominal no permite inferir huella, centro de gravedad, estabilidad o daños. |

Medium permanece sin propuesta automática cuando faltan datos de una intervención
real. No se rellena la categoría con una mejora inventada. El formulario de
fiabilidad aporta una hipótesis; el texto justificativo no certifica su veracidad.

## Qué queda fijo y qué se simula

| Elemento | Tratamiento durante la comparación |
|---|---|
| Topología, formato, demanda/commands, condiciones iniciales, pacemaker | Iguales entre baseline y candidato; solo cambian campos seleccionados y admitidos. |
| BPM, longitud, velocidad de banda, sensores, MTBF y MTTR seleccionados | Son **parámetros de entrada**, constantes dentro de cada corrida. |
| Fallas, reparaciones, inventario, producción, starvation y blocking | Evolucionan en la simulación según parámetros y semilla. |
| OEE, throughput, producción y pérdidas | Son salidas; nunca se ajustan directamente para obtener una mejora. |
| Máximo instalado, espacio físico y datos de intervención | Restricciones/evidencia externa, no resultados calculados por el optimizador. |
| Contrapresión mecánica, deformación, daño de etiqueta, caída y estabilidad | Fuera del modelo actual. Requieren medición, restricciones adicionales o un modelo físico específico. |

## Procedimiento implementado

1. Congelar una copia de las entradas. Conservar duración, turnos, rounds,
   commands, tick y muestreo. Mostrar duración, rounds y semilla usados.
2. Generar hipótesis para **toda la línea**, clasificadas por categoría. No mezclar
   automáticamente Zero, Medium y High. Se puede activar explícitamente la inclusión
   de opciones de menor CAPEX en Medium/High; el objetivo de la categoría superior
   prevalece si hay dos propuestas para el mismo campo. Los cambios de un equipo no excluyen
   explorar los sensores de los demás.
3. Aplicar checkboxes y límites físicos antes de cada cálculo. Validar identidad,
   valor original, rango y geometría con las mismas reglas en cliente/servidor.
4. Separar las comprobaciones de diseño de la validez física. Una transición
   `PASS → WARNING/FAIL` se informa con equipo y regla: ya no impide **simular**
   con `SCENARIO_AUDIT_REGRESSION`. Sí bloquea promover/crear esa propuesta desde
   la tarjeta hasta resolver la regresión. La geometría inválida sigue rechazada.
5. Evaluar el conjunto propuesto y bloques por equipo (por ejemplo longitud más
   sensor). Hacer búsqueda por coordenadas durante hasta tres pasadas, usando
   baseline, punto intermedio y objetivo de cada variable; las intervenciones
   externas usan únicamente su objetivo justificado. Reutilizar resultados
   repetidos. Los límites del usuario se aplican también a esta búsqueda.
6. Seleccionar por throughput, con OEE como desempate, sin empeorar OEE ni las
   comprobaciones de diseño previamente aprobadas. Se exige incremento de
   throughput mayor que `max(0.001 unidades/min, 0.1% del baseline)` para evitar
   presentar cambios despreciables como mejoras. Es un umbral de producto
   explícito, **no** significancia estadística.
7. Baseline y candidato utilizan semillas emparejadas. Verificar el ganador en
   otro bloque de semillas (offset al menos 1,000,003 y mayor que los rounds),
   que no se usa para seleccionarlo. Exigir el mismo criterio en ese bloque.
8. Si empeora, no mejora, no reproduce la mejora o agrava una comprobación de
   diseño, mantener deshabilitada la creación. Mostrar valores y causa. El
   resultado correcto puede ser **«no se encontró una mejora»**.

No se enumeran `2^N` subconjuntos ni se garantiza el óptimo global. La búsqueda
actual es acotada a objetivos e intermedios: puede perder interacciones que solo
aparecen en grupos particulares o fuera de esos valores. Para una segunda etapa
se propone búsqueda multistart / diseño de experimentos con rangos medidos,
restricciones conjuntas, presupuesto de evaluaciones y frente coste-beneficio.
No debe llamarse «todas las combinaciones posibles» al espacio acotado actual.

## Lectura de resultados y siguientes validaciones

- OEE y throughput usan la media de rounds si existe un batch. El OEE continúa
  siendo el definido por el motor; no incorpora un modelo nuevo de rechazo por
  calidad ni debe interpretarse como prueba de daño cero.
- La segunda semilla reduce el riesgo de elegir una corrida favorable, pero **no
  sustituye** intervalos de confianza, más réplicas, análisis de sensibilidad ni
  validación de planta. Corridas demasiado cortas pueden no observar fallas.
- La aprobación dinámica de la tarjeta es local. El servidor vuelve a validar
  entradas, propiedad, revisión y firma; no vuelve a ejecutar el motor. El clon
  se guarda con `INPUTS_VALIDATED_NOT_SIMULATED` y debe ejecutarse para conservar
  resultados. No hay garantía de mejora por llamar directamente al RPC.
- La tarjeta Basic conserva selección, límites, comparación y estado; los
  detalles técnicos están plegados o escondidos según el estilo Basic. Advance
  permite revisar la evidencia técnica y las comprobaciones de diseño.
- Antes de ejecutar una modificación física: contrastar longitudes disponibles,
  límites de velocidad por formato, maniobras de operador, calidad y seguridad
  con los responsables de planta. La app no valida estos aspectos no modelados.

## Decisiones pendientes para la siguiente iteración

1. Rangos operativos autorizados por sensor, conveyor y máquina; coste y tiempo
   de implementación por intervención.
2. Duración mínima y número de réplicas representativas por formato; umbral de
   mejora económicamente útil e intervalo de confianza sobre diferencias pareadas.
3. Datos de presión/daño y límites de velocidad por formato antes de optimizar
   contrapresión; ubicación de sensores y lógica PLC reales para ciclos cortos.
4. Comparación contra mediciones de una línea real y contra escenarios conocidos
   antes de utilizar las predicciones como compromisos de capacidad.

## Card actions and creation state

Cards group four icon-only controls with tooltips and accessible labels:
configuration (gear), bounded category search (update), calculation (magnifier),
and creation (copy). The magnifier becomes Stop throughout calculation, search,
DOE and independent confirmation, and cancels the current operation. There is
no separate Cancel button. Configuration changes invalidate evidence but do not
start additional simulations automatically.

A restarted evaluation clears the old interruption message, metrics and approval
before displaying current progress. Creation remains disabled during the search
and confirmation, after cancellation, or when the gain fails confirmation.
Engineering warnings require the existing explicit acknowledgement before
creating a review scenario. Restored approval also requires nonempty evaluated
changes. Creation errors appear in the originating card as well as the global
status. A completed validated selection can be created in either saving mode;
creation explicitly commits the source and its new scenario after confirmation.

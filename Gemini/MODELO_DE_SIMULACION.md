# Modelo de simulación

Conservar matemáticas y comportamiento del motor de referencia. La política de
inglés de BASE_DEL_PROYECTO.md aplica a código, UI, fixtures y documentación generada.

## Confiabilidad, semilla y unidades

MTBF y MTTR se ingresan en minutos y se convierten a segundos para el motor.
Los intervalos de falla siguen la distribución exponencial sembrada del motor;
MTTR es una duración fija, no una distribución adicional. Ambos ausentes desactivan
fallas de confiabilidad; importación no introduce microparos inventados.
El reloj de fallas avanza en AUTO/MANUAL, incluidos starving y blocking, y se pausa
en paro manual y microparos. Conservar estas reglas; no cambiar la base temporal
silenciosamente al interpretar datos de planta.

Asignar automáticamente una semilla entera válida y editable a cada simulación
nueva y persistirla. Clonar conserva la semilla. No regenerarla al abrir, guardar,
correr o actualizar la UI. Probar esos comportamientos.
Determinismo exige mismos datos, semilla, comandos, orden y opciones temporales.
Optimizar sensores, longitud o rampas no modifica MTBF/MTTR implícitamente.
En una corrida finita no se garantiza que promedios observados coincidan exactamente
con los parámetros. Las pérdidas de interacción pueden cambiar aunque la
confiabilidad configurada sea igual.

Flujo en unidades equivalentes/segundo; BPM dividido por 60. No convertir a cajas
por el pack pattern. OEE del modelo asume calidad 100%. Distinguir minutos de paro
de línea de equipo-minutos sumados: las pérdidas de equipos pueden solaparse.

## Referencia opcional para equivalencia

Adjuntar los cinco archivos de referencia juntos al implementar el motor:
[SeededRandom](referencia/SeededRandom.md),
[ConveyorEngineering](referencia/ConveyorEngineering.md),
[FormatGeometryAdapter](referencia/FormatGeometryAdapter.md),
[SimulationValidation](referencia/SimulationValidation.md) y
[LineSimulationEngine](referencia/LineSimulationEngine.md).
Adaptar import/export a los namespaces del nuevo empaquetado sin cambiar fórmulas,
PRNG, orden de operaciones o eventos. Sin referencia ejecutada no afirmar
equivalencia numérica exacta. Estos adjuntos contienen código de referencia, no
archivos que se agregan directamente al editor Apps Script.

## Physical conveyor model

## Model rule

Every conveyor is a physical accumulation zone. There is no abstract buffer,
`bufferAfterCapacity`, or `accumulationZone` override in a new Case.

A valid section of line alternates:

```text
Machine → Conveyor → Machine → Conveyor → Machine
```

The simulator infers the controlled upstream and downstream machines from that
sequence. Geometry is always active: it is not a switch that can be disabled.

## Inputs entered for each conveyor

The editor uses the terms from the FlowPilot / CAT worksheet. All lengths are
in millimetres and all times are in seconds.

| Input | Role in the simulation |
|---|---|
| `L_act` (`geometry.lactMm`) | Installed conveyor length. |
| `L_p` (`geometry.lpPrimeMm`) | Reserved Prime/infeed length. Prime is derived as `L_act − L_p`. |
| Package length + upstream discharge pitch | Establish the product population and the derived pitch on the belt. |
| Conveyor speed factor | Converts upstream discharge velocity into belt speed. |
| Discharge/reject runout, blocked delay, residual bottles, insurance | Calculate the required overflow length `L_bu`. |
| Installed Back-up position | Is checked against `L_bu`; it is not silently replaced. |
| Back-up blocked / clear delay | Debounce sustained photocell states. They are configured per conveyor; normal package pulses and gaps do not by themselves command a stop or restart. |
| Downstream high speed, infeed pitch, ramp-up | Calculate downstream consumption and recovery margin. |

The Case stores the raw inputs. The engine derives belt speed, pitch, capacity,
Prime position, material travel, Back-up requirement, and accumulation time
from them on every run.

## Controls represented by the engine

Positions are measured from upstream discharge toward downstream infeed.

- **Normal photoeye pulses:** a moving product blocks a photocell for
  `package length ÷ conveyor speed`; its normal clear gap is
  `product gap ÷ conveyor speed`. These are calculated from geometry and are
  visible in the conveyor panel. A product stream therefore does not look like
  a permanently blocked sensor.
- **Prime photocell:** when the leading product reaches `L_act − L_p`, its
  passing pulse authorizes the downstream machine to start and follow its
  configured ramp-up. `WAITING_FOR_PRIME` is therefore different from
  starvation.
- **Back-up photocell:** a queue that physically reaches the installed
  Back-up position holds the photocell continuously blocked. Only that
  sustained condition, for `Blocked_Time_Delay`, sends an upstream stop
  request; normal product pulses are recorded as `PULSING` and are ignored by
  the stop timer.
- **Residual discharge:** the upstream machine may still discharge its declared
  residual bottles after the stop request.
- **Clear delay:** after product clears Back-up, the signal must remain
  continuously clear for `Clear_Time_Delay` before the upstream stop request
  is released. A normal passing product resets the clear timer. This is why
  restart propagates through the line instead of being instantaneous.

`Blocked_Time_Delay` and `Clear_Time_Delay` are not universal constants. A
controls engineer, OEM or commissioning team chooses them from measured belt
speed, package dimensions/gaps, photocell response and PLC logic. The simulator
audits whether they are longer than the normal calculated product pulse and
gap; the demo values remain synthetic assumptions.

The line begins empty. A downstream machine remains `WAITING_FOR_PRIME` (and
has zero effective speed) until its upstream conveyor has physically carried
product to Prime. A stopped conveyor freezes product travel; it never
teleports material to the next machine.

## Derived engineering quantities

The audit shown after a run includes these values for each conveyor:

| Quantity | Meaning |
|---|---|
| `L_bu` | Required overflow length: runout sections plus product emitted during blocked-delay, stop residual and insurance. |
| `L_ba` | Usable accumulation length: `L_act − L_p − L_bu`. |
| `L_rec` | Recovery margin after a Back-up release. Positive is a smooth-restart margin; zero or negative indicates stuttering risk. |
| Anti-starve / anti-block time | Physical accumulation time available to protect downstream / upstream equipment. |
| Capacity | `floor(L_act / derived product pitch)`, in equivalent packages. |
| Normal sensor pulse / clear gap | Expected photoeye occupied / clear duration from package length, pitch and calculated belt speed. |
| Recommended infeed speed | Downstream high speed × infeed pitch with the worksheet's 5% margin. |

Five automatic goals are evaluated: usable inputs, smooth recovery (`L_rec >
0`), installed length (`L_act > L_p + L_bu`), installed Back-up position
(`Back-up ≥ L_bu`) and sensor debounce (both delays longer than a normal pulse
or gap). A warning is a design question, not an automatic plant recommendation.

## Calibration boundary

The public 13-unit demo contains complete **synthetic** FlowPilot inputs so it
can run immediately. Its results demonstrate the model; they are not plant
measurements, a sensor-placement prescription, or a CAPEX recommendation.

No plant-result validation is available in this stage. Validate synthetic fixtures and model consistency; do not claim plant calibration. Future validation against observed starts, stops, sensor timing and belt speed is a separate activity.

## Analysis, What-If and comparison

The Run Workspace has two different kinds of evidence. They should not be
interpreted as the same result.

| Evidence | Source | Varies by seed/run duration? |
| --- | --- | --- |
| Conveyor design audit | Geometry, rates, sensor positions, delays, runout and insurance margin | No |
| Dynamic run metrics | Time-stepped material flow, controls, failures and micro-stops | Yes |

The audit is a deterministic design check. It is recalculated when conveyor
inputs are resolved; it is not an average of the simulation samples. A `PASS`
means the known worksheet rules did not find a violation. It does not prove
that the conveyor is globally optimal or that a PLC design has been validated.

## Workflow

1. Run **Simulation A** with a virtual duration, command schedule and random
   seed that represent the question being studied.
2. Read **What this run indicates**. It combines one dynamic run with the
   physical conveyor audit and identifies the highest-priority issue.
3. If enough physical input exists, select **Create recommended Simulation B**.
   The Case saves a clone of A and applies only the listed input change. When
   input is incomplete, the panel explains what must be entered instead of
   inventing a change.
4. Review the cloned configuration, run B, and save it. The source result and
   its replay stay stored in A; B stores its own result and replay.
5. Open **Comparison**, choose A and B, and inspect every saved configuration
   and result field. Values that differ are highlighted.

There is deliberately no multi-seed batch experiment or automatic numerical
optimizer in the web app. One simulation answers one explicit engineering
question; the user decides whether the resulting change is worth testing.

## A direct A/B comparison

MTBF/MTTR failures and micro-stops are seeded. For a controlled comparison, use the same seed and virtual duration. This is necessary but does not prove causality: equipment order, commands, random-number consumption and the failure clock can change the realized events:

```
delta = Simulation B metric − Simulation A metric
```

The Comparison panel may label a result pair **Paired run** when seed and duration match, but must explain that this label does not guarantee identical failure events or isolate causality. It still shows different-seed results, but marks them as a
descriptive comparison rather than direct causal evidence.

For `Output`, `Rate`, and `OEE`, a positive delta is normally favorable. For
`Starved`, `Blocked`, `Failure`, and `Overflow`, a negative delta is normally
favorable. A favorable output does not justify a non-zero overflow.

## Evidence-led recommendations

The recommendation is not a fixed factor. It is ranked from the selected
conveyor's audit and this run's stored counters:

| Finding | Saved successor change | Boundary |
| --- | --- | --- |
| Installed length, Back-up position, or recovery margin fails | Set Back-up to calculated `L_bu` and solve for the minimum modeled `L_act` with all three recovery checks passing | High CAPEX; only when geometry inputs are complete |
| Back-up blocked/clear debounce is no longer than normal product pulses or gaps | Set each confirmation timer just above its modeled normal pulse/gap | Zero CAPEX; a simulated PLC setting to review with controls engineering |
| Current speed factor differs from calculated downstream infeed demand | Set the factor to the calculated infeed speed factor | Zero CAPEX; does not override a higher-priority geometry failure |
| Intrinsic failure loss / availability is poor | MTBF × 1.20 and MTTR × 0.85 sensitivity case | Low CAPEX/OPEX sensitivity only; it is not a maintenance promise |

If no material issue is detected, the panel recommends no automatic change.
Use **Clone Simulation** when you have a specific hypothesis not covered by
the evidence-led suggestion.

## Interpreting a conveyor that already passes

Use `PASS` as a feasibility gate, then optimize explicit objectives and
constraints. Examples:

| Candidate change | Dynamic evidence to inspect | Static guardrail |
| --- | --- | --- |
| Belt speed factor | Output, average/max inventory, starvation/blocking | Recommended speed, population and sensor timing |
| Back-up position | Back-up cycle count, overflow, upstream blocking | Required overflow `L_bu` and `BACKUP_POSITION` |
| Prime reserve/position | Waiting Prime and recovery behavior | Positive `L_rec` |
| Installed length | Max inventory, overflow and recovery | `INSTALLED_LENGTH`, anti-starve and anti-block |
| Blocked/clear delays | Back-up cycles and restart stability | `SENSOR_DEBOUNCE` |

Do not optimize all objectives into one number. First agree on constraints
such as `Overflow = 0`, an acceptable recovery margin, a maximum conveyor
speed, and a target output. Then compare controlled What-If changes one at a
time.

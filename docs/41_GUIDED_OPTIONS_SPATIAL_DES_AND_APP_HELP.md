# Opciones guiadas, DES espacial y ayuda de uso de Flow Pilot

## Campos de equipos y conveyors

Las tarjetas ya no muestran los tres cuadros de Characteristics, Noise profile y Process/format JSON. Su representación interna se conserva para importar, serializar y guardar los casos sin perder datos adicionales. Se retira de Settings el control que permitía mostrar esos cuadros. La importación/exportación del JSON completo del caso sigue disponible.

| Datos | Interfaz para editarlos |
| --- | --- |
| Tipo, nombre, BPM y modo inicial | Controles existentes; las restricciones de Basic se mantienen |
| Máquina crítica/pacemaker, máxima velocidad, recuperación | Controles existentes de equipo |
| MTBF/MTTR | Controles existentes de confiabilidad |
| Longitud, paquete, pitch de descarga, velocidad/gaps, Prime/Back-up, demoras, runout y productos residuales | Controles existentes del conveyor; no se duplican en el diálogo |
| Frecuencia y duración mínima/máxima de microparos | Additional options, en máquinas y conveyors, Basic y Advance |
| Retardo de arranque, rampa de máquina y pitch de entrada | Additional options, en máquinas; valores de máquina o respaldo para cálculos de conexión |
| Metadatos importados sin control dedicado | Se conservan; no se presentan como parámetros nuevos del motor |

Additional options abre un diálogo con entradas numéricas, unidades, ejemplos y ayuda. Vacío elimina el valor opcional y usa el valor por defecto. Se validan rangos y duración máxima ≥ mínima antes de aplicar. Cancelar conserva los valores originales. Aplicar marca el caso como modificado; Save o Autosave de Advance lo persisten según su configuración. Las opciones son del equipo de la simulación seleccionada, no preferencias globales.

Los valores explícitos de conveyor tienen prioridad donde lo define el adaptador de geometría; el pitch de entrada de la máquina también participa en el cálculo de diseño. No se borran los respaldos heredados del JSON. Los campos importados `startupDelaySeconds` y `restartRampUpSeconds` se trasladan a sus equivalentes `processData.upstream.startupTimeSeconds` y `processData.downstream.rampUpTimeSeconds` al abrir las tarjetas, manteniendo su precedencia.

## DES 0.4.0-experimental

El motor actual permanece como predeterminado. El selector Advance conserva el motor por simulación. El DES ahora utiliza productos discretos con posiciones físicas en mm; SimPy 4.1.2 continúa administrando el calendario de eventos. Python se ejecuta en el navegador con Pyodide, sin Google Cloud ni servidor Python de la empresa.

Se añadieron:

- Movimiento de cada producto, ocupación finita, separación de entrada y colisiones que forman una cola compactada. Consumir el producto de cabeza no teletransporta el siguiente al extremo.
- Cruces físicos de Prime, espera de la máquina y autorización de arranque. Back-up responde a ocupación sostenida de la cola estacionaria, evitando confundir los pulsos normales de productos en movimiento con una acumulación.
- Demoras de bloqueo/desbloqueo, posición de reinicio, respuesta de paro y reinicio, y rampa configurada en la conexión.
- Pausa, Stop y emergencia con Reset en conveyors; se congelan las posiciones. Fallas y microparos de conveyors y máquinas conservan material y trabajo pendiente.
- Descarga residual después del paro. Si la entrada no admite los productos residuales se contabilizan como overflow, por conveyor y total, dentro del balance de material.
- Estados y tiempos, colas, posiciones, sensores, pérdidas y versión del modelo en resultados y replay. Las pérdidas totales incluyen fallas/microparos de conveyors.
- Resolución de eventos creados en el mismo instante y avance a cada timestamp real, para evitar ciclos por redondeo al alcanzar sensores o límites.

Las posiciones representan la arista delantera del producto. La cabeza se detiene en la longitud del conveyor y los seguidores a un pitch compactado. La capacidad sigue siendo `floor(longitud / pitch compactado)`. El producto puede cruzar parcialmente la entrada durante su admisión. La pérdida por descarga residual debe calibrarse con el comportamiento de planta.

**Límites vigentes:** línea serial alternando máquinas y conveyors, un producto por servicio, sin lotes, merges/splits, conversión de unidades ni rechazos. La velocidad de conveyor es constante cuando está habilitado: aún no tiene aceleración propia. OEE y What-If siguen sin validarse para DES. No se afirma equivalencia con el modelo fluido actual ni con FlexSim u otros simuladores. Semillas iguales no emparejan calendarios aleatorios entre motores. Una librería DES no determina por sí sola el realismo: hay que contrastar los dos modelos con datos de planta.

Los resultados previos no cambian retroactivamente: volver a simular para evaluar este modelo. La primera ejecución DES requiere acceso HTTPS a jsDelivr para cargar Pyodide.

## Gemini como ayuda de uso

`ApplicationGuide.gs` mantiene una guía del producto que se adjunta siempre a las instrucciones de Gemini, además de los prompts personalizados. Describe secciones, campos, unidades, Basic/Advance, guardado, simulación, motor, exportaciones, CAPEX/DOE y chat. La petición incluye modo y contexto acotado de pantalla: sección actual, Settings abierto y nombre del equipo seleccionado. El contexto de pantalla es información declarada por el cliente, no prueba de cambios guardados.

Con un caso abierto y Gemini configurado, el usuario puede preguntar, por ejemplo:

- “¿Cómo guardo este caso?”
- “¿Qué diferencia hay entre MTBF y MTTR y dónde los cambio?”
- “¿Cómo cambio al motor DES?”
- “¿Qué hace la velocidad de reproducción?”
- “¿Cómo selecciono variables para DOE?”

La guía pide respuestas prácticas en el idioma del usuario, con etiquetas reales, sin producir escenarios de mejora para preguntas de navegación. Gemini explica los pasos; no acciona botones ni guarda o ejecuta por sí mismo. Si falta evidencia, debe pedir el error o pantalla concreta. Se conserva el contexto de la simulación seleccionada y su historial. No se necesita una segunda API ni infraestructura nueva.

## Validación local

Verificación enfocada, sin ejecutar toda la suite:

- 13 verificaciones físicas del nuevo DES: Prime, cola/Back-up, ausencia de falsos paros, pausa/falla de belt, emergencia/Reset, microparos, rampas/demoras, runout y balance, independencia del intervalo de muestras y rechazo de entradas inválidas.
- 7 verificaciones analíticas anteriores de rampas/microparos permanecen correctas.
- Adaptador real ST → Python/SimPy → resultado normalizado, incluyendo versión, pérdidas, sensores, turnos y JSON finito.
- Guía y pantalla de Gemini presentes en peticiones; contexto restringido, presupuestos y validación existentes conservados.
- Diálogos en Basic y Advance: campos, ejemplos, rechazo de duración inválida, cancelar, conservación de metadatos, guardado y opciones de conveyor.
- Ensamble de módulos y selección del motor actual por defecto.

Comandos:

```sh
node --test test/DesPhysics.test.js test/SpatialDes.test.js test/SimPyBrowserEngine.test.js test/GeminiService.test.js test/ModularAppsScript.test.js
node --test --test-name-pattern='guided equipment options|Basic hides units' test/Interface.test.js
```

45 pruebas Node y 2 de interfaz aprobaron; las verificaciones Python se ejecutan dentro de esos tests. No se probó la API real de Gemini ni el despliegue Apps Script en esta entrega.

## Archivos de Apps Script que actualizar

**Nuevos:**

- `apps-script/ApplicationGuide.gs`
- `apps-script/EquipmentOptions.html`

**Modificados:**

- `apps-script/Assistant.html`
- `apps-script/Client.html`
- `apps-script/EditorStyles.html`
- `apps-script/GeminiService.gs`
- `apps-script/SimulationEngine.html` (generado, contiene los fuentes Python integrados)
- `apps-script/WebApp.html`

Actualizar el checkout, ejecutar `clasp push` y publicar una nueva versión del despliegue de la web app. El manifest no cambia. Los `.py`, tests y docs no se suben como módulos Apps Script independientes.

## Otros archivos modificados o creados

- `scripts/build-browser-engine.mjs`
- `src/simulation/SimPyBrowserEngine.js`
- `src/simulation/python/st_simpy_engine.py`
- `src/simulation/python/st_spatial_engine.py` (nuevo)
- `test/GeminiService.test.js`
- `test/Interface.test.js`
- `test/ModularAppsScript.test.js`
- `test/SimPyBrowserEngine.test.js`
- `test/SpatialDes.test.js` (nuevo)
- `test/spatial_des_test.py` (nuevo)
- `docs/35_BROWSER_SIMPY_ENGINE.md`
- `docs/40_DES_PHYSICS_AND_CASE_PREFERENCES.md` (nota de actualización)
- `docs/41_GUIDED_OPTIONS_SPATIAL_DES_AND_APP_HELP.md` (este archivo)

# Catálogo completo de variables y DOE elegido por el usuario

**Versión anterior, sustituida por `38_SEARCH_DERIVED_DOE_AND_AGENT_RESPONSE.md`.** La lista actual de DOE en las tarjetas de categoría se deriva de pruebas factibles de Find best scenario, según las reglas CAPEX. Este documento conserva el registro de la implementación anterior.

El catálogo anterior contenía únicamente cambios propuestos por el planificador. Se preparaba antes de **Search best scenario**; no era una lista de variables importantes descubiertas por la búsqueda. DOE seleccionaba los primeros cuatro factores y bloqueaba los demás. Los objetivos externos de MTBF/MTTR no podían ser factores de DOE.

## Comportamiento

Cada categoría muestra el catálogo de parámetros admitidos por el modelo para cada tipo de equipo. Las recomendaciones de esa categoría conservan su selección inicial para la búsqueda; los demás objetivos empiezan en el valor actual y sin seleccionar. Ningún factor DOE se preselecciona. El usuario elige hasta cuatro; intentar un quinto muestra un aviso y conserva los cuatro elegidos. Puede desmarcar cualquiera o borrar la selección.

El catálogo incluye velocidades de máquina, MTBF, MTTR, arranque de máquinas y parámetros soportados de conveyors. Los parámetros sin baseline numérico, sin máximo instalado o inactivos por el modo de velocidad siguen visibles con explicación. Se conserva la política que fija la velocidad de la máquina de referencia y los controles de geometría y máxima velocidad instalada. No se incorporan parámetros que el motor no modela.

Los campos **Target**, **Low** y **High** permiten definir la hipótesis de intervención. Un MTBF/MTTR requiere baseline positivo y justificación explícita de mantenimiento, recursos de reparación o reemplazo y de la base del objetivo. DOE permite MTBF desde el baseline hacia arriba y MTTR desde el baseline hacia abajo. Cada combinación conserva `external: true` y su justificación, para pasar las mismas validaciones del navegador y servidor. Una justificación ingresada no prueba que una intervención vaya a alcanzar ese objetivo en planta.

Los controles, objetivos, niveles, selección y justificación se guardan en la evaluación de la simulación. Buscar y evaluar no cambian el equipo original; Crear guarda otro escenario después de la confirmación con semillas independientes.

## CAPEX

Zero, Medium y High son categorías independientes de propuestas; no son conjuntos anidados ni presupuestos monetarios calculados. El catálogo completo se muestra en cada una. La política existente del servidor excluye de Zero los cambios de longitud y las intervenciones externas de confiabilidad; estas filas explican que debe usarse Medium o High CAPEX (All CAPEX también lo permite en Advance). Medium/High son la categoría declarada de la intervención: el programa no calcula su coste ni convierte automáticamente mantenimiento en inversión de capital. En Advance, All CAPEX combina propuestas de las tres categorías y permite explorar el catálogo completo.

## Instalación en Apps Script

Sustituir por la versión publicada en GitHub:

- `ScenarioExplorer.html`
- `AnalysisStyles.html`
- `SimulationEngine.html` (generado; no editar directamente)
- `ScenarioEngine.gs` (generado; no editar directamente)

Después crear una versión nueva y actualizar la implementación web. No requiere Google Cloud ni un servidor adicional. Se mantiene la restricción actual de What-If para el motor experimental SimPy.

## Comprobación manual

1. Abrir una simulación y What-If. Configurar High CAPEX: aparecen equipos y conveyors, incluidos MTBF/MTTR.
2. Activar DOE: hay cero factores seleccionados. Elegir cualquier cuatro y comprobar el aviso al intentar un quinto; desmarcar uno y elegir otro.
3. En un equipo con baseline de MTBF positivo, seleccionar ese factor y definir dos niveles (el inferior no menor que el actual). Escribir la justificación de intervención. Para MTTR, el nivel superior no debe superar el actual.
4. Ejecutar Search best scenario. Revisar combinaciones, resultados y confirmación independiente. Un objetivo sin justificación o con dirección inválida se rechaza.
5. Guardar y reabrir el caso: se conservan selección, niveles y justificación. El baseline de los equipos permanece igual.
6. En Zero CAPEX, las filas de confiabilidad y longitud explican su restricción de categoría.

Las verificaciones locales usan RPC sintético de Apps Script; no se ha probado ni actualizado una implementación real de Apps Script.

## Archivos modificados en GitHub

Además de los cuatro archivos de Apps Script indicados arriba:

- `src/analysis/ScenarioPlanner.js`
- `src/analysis/ScenarioDOE.js`
- `scripts/build-browser-engine.mjs`
- `scripts/validate-interface-browser.mjs`
- `test/Interface.test.js`
- `test/ScenarioPlanner.test.js`
- `test/ScenarioDOE.test.js`
- `docs/37_DOE_VARIABLE_CATALOG.md`
- `docs/validation/2026-10-07-doe-browser.json`
- `docs/validation/2026-10-07-doe-suite.json`

# Contratos entre módulos

Base: commit 8d49bf3. Estos contratos separan persistencia, motor y presentación.
En el proyecto nuevo completar detalles con fixtures y pruebas antes de implementar
cada capacidad. No inventar firmas porque el contexto del chat se haya perdido.

## RPC de Main.gs

Respuesta común: {ok:true,data:...} o {ok:false,error:{code,message,details}}.
Errores inesperados se saneán. Las funciones internas terminan en _.

| Método público | Entrada | data en éxito |
|---|---|---|
| getBootstrap | sin argumentos | user, globalConfig, settings, gemini, cases |
| saveUserSettings | request | settings normalizados, nunca API key |
| createCase | request | resumen del caso creado |
| getCase | caseId | caso con simulations normalizadas |
| saveCase | request con id y expectedRevision | caso actualizado, revisión incrementada |
| deleteCase | caseId | id y name; archivo a papelera |
| cloneCase | caseId | resumen del caso nuevo |
| cloneSimulation | caseId, simulationId | caso completo con nueva simulación |
| createPublicDemoCase | sin argumentos | resumen del caso sintético |
| previewSheetImport | caseId, spreadsheet (URL/ID), sheetName opcional | equipos, metadatos, diagnósticos y procedencia |
| askGemini | caseId, simulationId, question, history | text, model |

previewSheetImport también añade importVersion al envelope exterior.
Conservar fallos de transporte separados de errores de dominio.
No ejecutar peticiones reales de integración desde tests unitarios.

## Persistencia

Case: schemaVersion, id, name, unitOfFlow, equipment, engineConfig, simulations,
metadata, stateIds, ownerEmail, revision, createdAt, updatedAt.
Simulation: id, name, equipment, dynamicConfig, results, scenario, sourceImport,
clonedFromSimulationId, createdAt, updatedAt.

equipment/engineConfig a nivel caso existen por compatibilidad; no convertirlos en
otra fuente de verdad independiente de la simulación activa.
Guardar exige expectedRevision; conflicto no debe sobrescribir.
Un borrador puede estar vacío aunque el schema inicial exija al menos dos equipos:
validación de guardado y validación para correr NO son la misma operación.
Los schemas iniciales no describen por completo el sobre persistido actual;
ampliarlos en la reconstrucción con pruebas explícitas.

Clonar preserva IDs de equipos para comparación, configuración y procedencia;
asigna nuevo ID de simulación y limpia resultados (su forma vacía puede normalizarse
a objeto). Ausencia de una corrida no equivale a métricas de valor cero.

## Motor

Entrada simulateLine:
- case: caso de cálculo con equipment de la simulación seleccionada.
- run: durationSeconds, tickSeconds, sampleEverySeconds, seed entero y commands.
- Comando: atVirtualSecond, equipmentId, action, más parámetros admitidos por validador.

Salida: {ok:true,result:...} o resultado estructurado de validación {ok:false,...}.
No confundir result del motor con data del RPC.
window.SimulatorEngine expone simulateLine, validateSimulationInput y
calculateConveyorEngineering. El módulo Node y el bundle deben ser equivalentes.

Unidades: cálculo de flujo en unidades equivalentes/segundo; BPM / 60 al importar.
Longitudes mm; tick, retrasos y contadores en segundos; MTBF/MTTR de entrada en minutos.
No usar pack pattern para convertir silenciosamente flujo a cajas/pallets.
Secuencia y geometría determinan transporte; conservar orden del PRNG y de eventos
si se exige reproducir exactamente resultados del motor de referencia.

Los resultados incluyen seed, durationSeconds, summary, equipos, eventos y muestras;
consultar createResult y pruebas para sus campos exactos antes de implementar consumidores.
Compare empareja equipos por ID. Delta = propuesta − baseline; OEE absoluto en puntos
porcentuales. Baseline cero: porcentaje relativo no definido, no infinito.
Misma semilla/duración es condición de comparabilidad, no prueba de causalidad.

## Contrato fijo Sheets

Metadatos C1:C7: site, packagingLine, formatName, containerSizeOz, bottlesPerCase,
dateOfAnalysis, by. Equipos desde fila 10, máximo 1,000 filas.

| Columna | Campo | Unidad |
|---|---|---|
| A/B/C | type / name / critical Y/N | texto |
| D/E/F | mtbfMinutes / mttrMinutes / maximumSpeedBpm | min / min / BPM |
| G/H | lactMm / lpPrimeMm | mm |
| I/J | actualDischargeMm / actualCodingMm | mm, conservar sin reinterpretar |
| K/L | packageLengthMm / dischargePitchMm | mm |
| M/N | startupTimeSeconds / bottlesDischargedAtStop | s / unidades |
| O/P | infeedPitchMm / rampUpTimeSeconds | mm / s |
| Q | conveyorSpeedFactorVsDischargeVelocityPercent | incremento % |
| R | codingConveyorSpeedFactorVsPreviousConveyorPercent | % conservado |
| S | conveyorSpeedFactorVsPreviousConveyorPercent | % conservado |
| T/U | blockedTimeDelaySeconds / clearTimeDelaySeconds | s |
| V | insuranceFactorUnits | unidades |
| W | overspeedVsInfeedScrewPercent | % conservado |

Nombre de pestaña explícito > gid de URL > primera pestaña.
NA/N/A/vacío = ausente, no cero. Error de fórmula es error, no NA.
MTBF/MTTR ambos positivos o ambos ausentes. Porcentaje Sheets 0.05 formateado como
5% = 5 puntos porcentuales; Q=5 representa factor 1.05.
I/J/R/S/W se conservan sin atribuirles cálculos no implementados. P combina ramp-up
y retraso Prime; registrar esa limitación, no inventar su separación.

Preview compara con valores actuales incluso sin guardar; selección por fila/campo:
omitir, agregar, actualizar. Matching por nombre único/binding; ambigüedad requiere
elección. Preservar ID, orden y campos no seleccionados del equipo existente.
NA desmarcado por defecto; marcado explícitamente puede limpiar un campo válido.
Impedir dos filas actualizando el mismo equipo. Cancelar/no-op no cambia nada.
Cambio de equipo invalida solo resultados de la simulación activa; metadatos no.
Rechazar respuestas tardías de otro caso/simulación. sourceImport preserva snapshot,
bindings y lastApplied. No escribir en Sheet ni enviar importación a IA.

## Recursos y UI

TextResources.gs: __ST_TEXT__('clave') para JS,
__ST_HTML_TEXT__('clave') para HTML dinámico,
<?= __ST_TEXT__('clave') ?> para texto estático; resolveTextResources_ resuelve
y escapa según contexto. No traducir IDs, claves JSON, enums ni datos del usuario.
Agregar clave y consumidor juntos; valores textuales sin markup. Probar comillas,
saltos de línea, caracteres HTML y cierre de script.

WebApp.html posee IDs DOM; módulos usan esos contratos y nombres ST* actuales.
Antes de cada cambio registrar IDs/selectores/eventos consumidos y emitidos.
No crear IDs duplicados ni suscripciones múltiples al cambiar vistas.
Tema emite st:theme; Charts debe redibujarse sin cambiar resultados.
Toda variable CSS consumida debe existir en DesignTokens o un scope documentado.

Gemini: clave en UserProperties, modelo configurable, caso guardado verificado.
Límites de referencia: pregunta 6,000 caracteres, historial hasta 24 mensajes de
32,000 caracteres y contexto 2 millones de caracteres; reportar exceso sin truncado
silencioso. Mostrar texto seguro; limpiar conversación al cerrar/cambiar caso/sesión.

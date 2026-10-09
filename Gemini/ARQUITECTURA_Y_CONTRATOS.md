# Arquitectura y contratos

La política de inglés de [BASE_DEL_PROYECTO.md](BASE_DEL_PROYECTO.md) es obligatoria para todos los módulos.

## Arquitectura

## Diferencia deliberada respecto del repositorio original

Esta es una reconstrucción NUEVA. Conserva funciones de negocio y matemáticas, pero
el empaquetado cambia para no requerir herramientas de desarrollo.
NO usar Code.gs/Index.html/SimulationEngine.html generados ni scripts Node.
No mezclar archivos de esta variante con el despliegue de la versión original.

Servidor: módulos .gs planos. Cliente: módulos .html con <script> o <style>.
Main.gs: doGet() evalúa WebApp.html. include_(nombre) devuelve contenido de un archivo
HTML autorizado del proyecto. WebApp incluye módulos estáticos usando
<?!= include_('Nombre'); ?> en orden de dependencias. No se soportan subcarpetas
reales en el editor Apps Script.

Evitar templates anidados sin evaluar. El contenido de cada módulo incluido será
HTML/JS/CSS estático; no dejar <?= ... ?> dentro de los fragmentos esperando evaluación.
Recursos textuales se transfieren una sola vez desde TextResources.gs mediante un
JSON escapado seguro en WebApp, con carga anterior a consumidores.
Serializar <, >, &, U+2028 y U+2029 de modo seguro para evitar cierre de script.
UI estática usa data-i18n y atributos explícitos; UI dinámica usa STText.get(clave)
y textContent/creación DOM. No interpolar texto no confiable como HTML.
Esta API de recursos es nueva y reemplaza los marcadores de build del original.

## Módulos propuestos

| Capa | Archivos |
|---|---|
| Entrada/config | Main.gs, appsscript.json, ApiResponse.gs, TextResources.gs |
| Servidor de casos | AuthService.gs, ConfigService.gs, DriveService.gs, CaseService.gs, DemoCaseFactory.gs |
| Integraciones | SheetImportService.gs, GeminiService.gs |
| Recursos cliente | TextClient.html, DesignTokens.html, Icons.html, UiPreferences.html |
| Estilos | Styles.html, ShellStyles.html, CasesStyles.html, DialogStyles.html, EditorStyles.html, SimulationStyles.html, AnalysisStyles.html, AssistantStyles.html, SheetImportStyles.html |
| Motor | EngineRandom.html, EngineEngineering.html, EngineGeometry.html, EngineValidation.html, EngineRuntime.html |
| UI y estado | ApiClient.html, State.html, Shell.html, Settings.html, CaseGallery.html, EquipmentEditor.html, EquipmentDrag.html, SimulationController.html, Charts.html, Results.html, Comparison.html, WhatIf.html, Assistant.html, SheetImportMerge.html, SheetImport.html, Client.html |
| DOM | WebApp.html |
| Pruebas aisladas | TestPage.html, TestRunner.html, EngineTests.html, ContractTests.html, UiTests.html, ServerTests.gs |

Fijar firmas y dependencias en el plan inicial. Dividir aún más módulos grandes solo
con actualización explícita del inventario y de todos sus consumidores.
Client.html inicializa; no concentra toda la lógica.

Cada módulo cliente usa IIFE/namespace único. EngineRandom → EngineEngineering →
EngineGeometry → EngineValidation → EngineRuntime; sin import/export.
Un único namespace STEngine contiene helpers exportados del motor y la fachada
SimulatorEngine conserva simulateLine/validateSimulationInput/calculateConveyorEngineering.
Los helpers locales permanecen privados. Cargar todos antes de cualquier consumidor.
Las referencias .js están incluidas como .md: adaptar únicamente carga/exportación,
sin cambiar orden de operaciones, fórmulas, PRNG o unidades.

## Pruebas sin terminal

TestPage usa exactamente los mismos módulos de motor y recursos que WebApp; nunca
una segunda copia del algoritmo. Se habilita solo en proyecto de prueba mediante
flag de ScriptProperties y control de identidad. La ruta normal no carga tests.
TestRunner muestra PASS/FAIL, esperado/obtenido, conteo y permite copiar JSON del reporte.
ServerTests.gs expone un runner ejecutable desde el editor, usa dobles inyectados
de Drive/Properties/Sheets/UrlFetch y ninguna llamada real por defecto.
No reemplazar globales Google permanentemente para simularlas.
UiTests usa DOM de fixture, adaptador RPC falso y limpia listeners/estado al acabar.

El usuario abre la página de pruebas o ejecuta el runner desde Apps Script y pega
el reporte en Gemini. Ningún modelo puede declarar ejecución local por inspección.

## Etapas parciales

Solo incluir módulos que ya existen y tienen implementación completa.
Funciones futuras no deben tener botones operativos ni retornos falsamente exitosos.
Mantener tabla inventario/estado; actualizar WebApp/includes en cada lote coherente.

## Despliegue

Archivo manifiesto V8 y zona horaria confirmada. Confirmar USER_ACCESSING frente a
USER_DEPLOYING y quién autoriza acceso. No trasladar identidades de prueba a producción.
Definir scopes de identidad, Drive, lectura Sheets y external requests conforme al
código generado. Distinguir scopes declarados de consentimiento concedido; volver a
autorizar cuando haga falta. La preview de HTML fuera de Apps Script no prueba RPC/OAuth.

Crear/desplegar manualmente desde el editor en un proyecto de prueba; explicar
archivos a crear y qué sustituir. No instalar herramientas ni usar terminal.

## Contratos

Base funcional: commit 8d49bf3. Reglas de empaquetado y recursos se adaptan en este documento. Estos contratos separan persistencia, motor y presentación.
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
| createReferenceCase / createDemoCase | sin argumentos | resumen del caso sintético |
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
Fijar el sobre persistido como fixture JSON de prueba y validarlo con funciones
JavaScript explícitas, sin requerir librerías ni schemas externos.

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
calculateConveyorEngineering. Los cinco módulos Engine*.html cargados en WebApp y TestPage deben ser los mismos. No existe build Node en esta variante.

Unidades: cálculo de flujo en unidades equivalentes/segundo; BPM / 60 al importar.
Longitudes mm; tick, retrasos y contadores en segundos; MTBF/MTTR de entrada en minutos.
No usar pack pattern para convertir silenciosamente flujo a cajas/pallets.
Secuencia y geometría determinan transporte; conservar orden del PRNG y de eventos
si se exige reproducir exactamente resultados del motor de referencia.

Los resultados incluyen seed, durationSeconds, summary, equipos, eventos y muestras;
consultar createResult en referencia/LineSimulationEngine.md para sus campos exactos y fijar fixtures antes de implementar consumidores.
Compare empareja equipos por ID. Delta = propuesta − baseline; OEE absoluto en puntos
porcentuales. Baseline cero: porcentaje relativo no definido, no infinito.
Misma semilla/duración es condición de comparabilidad, no prueba de causalidad.

## Importación

El contrato completo de celdas, unidades y mezcla selectiva está en [IMPORTACION_SHEETS.md](IMPORTACION_SHEETS.md). Es su única definición canónica.

## Recursos y UI

Esta variante usa TextResources.gs como único diccionario y TextClient.html como
lector STText.get(clave), cargado antes de cualquier UI. WebApp recibe JSON escapado;
atributos data-i18n identifican texto estático y textContent presenta valores dinámicos.
No usar los marcadores __ST_TEXT__/__ST_HTML_TEXT__ del build original.
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


## Consistencia de almacenamiento y seguridad

Comparar expectedRevision y guardar bajo el mismo bloqueo de servidor para evitar
dos escrituras simultáneas aceptadas. Probar conflicto, propiedad, clonación y
fallos de persistencia sin sobrescribir una versión válida.
Comprobar identidad y acceso al caso en cada RPC; una pantalla de login no sustituye
autorización servidor. No almacenar contraseñas ni simular un cierre de sesión Google.
La API key de Gemini permanece en UserProperties, nunca en HTML, bootstrap, export,
logs ni reportes de pruebas. Verificar propiedad antes de UrlFetch.

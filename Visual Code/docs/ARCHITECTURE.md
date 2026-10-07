# Arquitectura vigente y estrategia de reconstrucción

## Capas reales

| Capa | Fuentes actuales | Responsabilidad |
|---|---|---|
| Motor puro | src/simulation/SeededRandom.js, ConveyorEngineering.js, FormatGeometryAdapter.js, SimulationValidation.js, LineSimulationEngine.js | Validación física, cálculo y resultados deterministas sin DOM, Drive ni Gemini |
| Servidor | apps-script/ApiResponse.gs, AuthService.gs, ConfigService.gs, DriveService.gs, CaseService.gs | Errores, identidad, preferencias, propiedad y JSON en Drive |
| Integraciones | SheetImportService.gs, GeminiService.gs | Lectura de Sheets; consulta Gemini con datos guardados y clave solo servidor |
| Datos sintéticos | PublicDemoCaseFactory.gs; examples/ | Casos de referencia, no datos reales |
| Entrada | Main.gs, WebApp.html | RPC y plantilla DOM, composición de módulos |
| Recursos | TextResources.gs, DesignTokens.html, Fonts.html, Icons.html | Textos, tokens, fuente/licencia e iconos |
| UI | UiPreferences, Shell, Settings, CaseGallery, Results, Charts, Comparison, Assistant, EquipmentDrag, SheetImportMerge, SheetImport y Client (.html) | Preferencias, navegación, vistas, interacción y orquestación |
| CSS | Styles, EditorStyles, SimulationStyles, AnalysisStyles, ShellStyles, CasesStyles, DialogStyles, DashboardStyles, AssistantStyles, SheetImportStyles (.html) | Componentes y layouts por responsabilidad |
| Verificación | test/, schemas/, scripts/ | Contratos, fixtures, construcción, preview sintético |

Los módulos Apps Script se mantienen planos bajo apps-script/ por compatibilidad.
Client.html aún concentra mucha orquestación: es una limitación existente, no un
objetivo a reproducir. Extraer por responsabilidad es admisible en la reconstrucción
solo con contratos y pruebas; no reorganizar silenciosamente el repositorio original.

## Fuente única y archivos generados

1. build-browser-engine.mjs procesa SeededRandom → ConveyorEngineering →
   FormatGeometryAdapter → SimulationValidation → LineSimulationEngine.
   Produce apps-script/SimulationEngine.html con window.SimulatorEngine.
2. build-manual-apps-script-bundle.mjs resuelve textos e includes de WebApp.html.
   Produce apps-script/Code.gs e Index.html.
3. npm run build:apps-script ejecuta ambas etapas en orden.

No editar los tres artefactos manualmente. El orden exacto de includes y servicios
lo define el generador actual; mantenerlo y probarlo al agregar módulos.
package-lock.json se genera con el gestor de paquetes, no se redacta con IA.
No inventar datos base64 de fuentes: reutilizar un recurso autorizado con licencia
o usar fuentes del sistema.

Hay dos modalidades excluyentes de despliegue:
- Bundle: Code.gs + Index.html + appsscript.json.
- Modular: fuentes .gs y .html, incluido SimulationEngine.html generado, excluyendo
  Code.gs e Index.html; Main abre WebApp.

No instalar bundle y fuentes de servidor juntos: duplicarían funciones globales.
Publicar en GitHub no actualiza Apps Script. Mantener despliegue manual como opción;
clasp no es requisito ni se autoriza por usar Code Assist.

## Entorno y límites

Node es herramienta de desarrollo, no runtime de producción. Las pruebas UI usan
jsdom y parsers CSS de desarrollo. Verificar instalación y autorización antes de
instalar dependencias o ejecutar comandos en el equipo del usuario.
La extensión instalada no demuestra permiso corporativo para usar código/datos,
ni que Node, Git o modo agente estén disponibles.

El motor actual es de pasos temporales con eventos, no un scheduler exclusivamente
de eventos discretos. Se calcula una corrida y se reproduce; controles durante
replay agregan comandos y recalculan determinísticamente. No confundir velocidad de
playback con velocidad física o tick.

El catálogo actual se obtiene de archivos JSON en Drive, no de un índice Sheets.
Sheets se usa como fuente de importación. No existen PDFService, AIManager,
MetricsService, SimulationService ni AuditService como módulos implementados.

## Seguridad y configuración

Todas las operaciones remotas pasan por identidad/propiedad. Nunca enviar claves en
bootstrap, localStorage, fixtures ni prompts. Gemini recibe el caso guardado tras
verificación y no tiene autorización para ejecutar cambios de ingeniería.
Tratar nombres, campos importados y respuestas IA como datos no confiables.

La base versionada tiene USER_ACCESSING/MYSELF y no enumera oauthScopes.
El usuario reportó un despliegue USER_DEPLOYING/MYSELF con scopes explícitos.
No asumir que son equivalentes: confirmar cuenta ejecutora, acceso y autorización
Sheets/Drive/external requests antes de pruebas reales. No cambiar el manifiesto
original desde una tarea de documentación.

## Desarrollo por capacidades

Cada etapa modifica todos los archivos necesarios de una capacidad, incluye pruebas
unitarias y de integración y termina con evidencia. La carpeta nueva contiene docs/,
prompts/, schemas/ y examples/ como referencia autorizada; test/ y src/ pueden
consultarse como oráculo de compatibilidad si el usuario lo permite.
Si solo se entregan documentos, marcar equivalencia numérica exacta como no verificada.

Mantener docs/BUILD_STATUS.md en el proyecto nuevo: etapa, cambios, contratos,
comandos ejecutados, resultados, pendientes y siguiente tarea. Esta bitácora
complementa al código actualizado; no reemplaza inspeccionarlo en cada sesión.

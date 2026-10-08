# DOE por búsqueda y respuesta del agente

Esta versión corrige la ampliación del catálogo descrita en `37_DOE_VARIABLE_CATALOG.md`.

## Flujo de las tarjetas de búsqueda por CAPEX

1. El planificador prepara candidatos soportados para la categoría, a partir de los equipos y restricciones de la simulación. No son resultados de una búsqueda todavía.
2. **Find best scenario** evalúa esos candidatos con el motor actual. La búsqueda registra, por equipo y parámetro, los extremos observados en cambios de combinaciones factibles. Conserva este resumen aunque el historial detallado de pruebas se recorte.
3. DOE habilita únicamente los factores numéricos que variaron en esas pruebas factibles. Incluye alternativas que no ganaron; excluye parámetros no evaluados, cambios inviables y valores sin baseline numérico. Ningún factor se selecciona automáticamente.
4. El usuario elige hasta cuatro y define Low/High dentro de los extremos evaluados; ejecuta nuevamente la búsqueda con DOE activado. Para ampliar un objetivo debe cambiarlo y volver a buscar. Cambiar objetivos o límites invalida la disponibilidad anterior de factores.
5. Las combinaciones de DOE vuelven a pasar las verificaciones físicas. Estar dentro de los extremos observados no garantiza que todas las combinaciones sean factibles. Un diseño incompleto no produce estimaciones de efectos.

La búsqueda está acotada por sus límites; no establece un óptimo global. Si se termina antes, la lista refleja solo las variables realmente evaluadas en pruebas factibles. El origen de la simulación, la configuración y la categoría forman parte de la identidad de la evaluación; la selección, los extremos y la evidencia permanecen guardados en esa simulación. Crear requiere la confirmación independiente existente. Buscar no modifica el equipo original.

### Categorías

- **Zero:** ajustes de velocidades y controles instalados, sensores y tiempos. Sin extensión de longitud ni cambios externos de confiabilidad.
- **Medium:** intervenciones locales documentadas; MTBF/MTTR solo con un objetivo y la justificación de mantenimiento, recursos de reparación o retrofit. No incorpora extensiones de longitud.
- **High:** proyectos de extensión o reemplazo respaldados por restricciones físicas y objetivos documentados. El planificador mantiene sus propuestas de acumulación; un objetivo explícito de confiabilidad puede representar un reemplazo.
- **All CAPEX**, en Advance: combina candidatos soportados; si el mismo parámetro tiene objetivos por varias categorías, la combinación conserva el objetivo de la categoría superior. Cada categoría conserva su propio objetivo al evaluarse por separado.

Estas son categorías de alcance, no importes calculados. El modelo no inventa costes ni porcentajes de mejora. Las definiciones editables del agente orientan sus propuestas; editar texto de un prompt no reprograma las restricciones físicas ni las reglas del buscador.

El desplegable **Add maintenance, retrofit or replacement target** permite seleccionar equipo, MTBF/MTTR, categoría Medium/High, objetivo y justificación. El baseline debe ser positivo; MTBF aumenta o MTTR disminuye. La misma variable puede conservar objetivos diferentes por categoría. Una justificación escrita no prueba que una intervención vaya a lograr ese resultado en planta. El objetivo se convierte en factor DOE después de una búsqueda factible en su categoría.

## Settings → Gemini, en Advance

Las opciones se guardan en las propiedades del usuario de Google, junto con su configuración del agente. No se envía la llave API al navegador.

| Opción | Comportamiento |
|---|---|
| Temperature | Vacío usa el valor del modelo; 0–2 regula variación de salida. No es un control de velocidad. |
| Response mode | Model default conserva la política del modelo. Fast reduce el razonamiento disponible; Thorough lo aumenta dentro del límite de salida. No garantiza un tiempo de respuesta. |
| Maximum response tokens | 2,048 / 4,096 / 8,192. Un límite menor puede truncar explicaciones o JSON; el error conserva la pregunta. |
| Display response | Presentación progresiva breve (máximo 900 ms) o inmediata al recibir la respuesta completa. |

Fast/Thorough usan `thinkingBudget` en Gemini 2.5 Flash/Pro y `thinkingLevel` LOW/HIGH en Gemini 3. Flash admite presupuesto 0; Pro conserva el mínimo 128 en Fast. En Thorough se deja margen para texto dentro de `maxOutputTokens`. Para otro modelo se exige Model default, en vez de enviar parámetros incompatibles. Los valores predeterminados conservan temperatura del modelo, razonamiento del modelo y 8,192 tokens. El motor de simulación no cambia.

### Espera y presentación

El chat muestra actividad desde la preparación del caso y, mientras espera, un indicador animado y contador de segundos en un área visible por encima de la conversación. Después de 15 segundos aclara que se sigue esperando al servidor. Es un indicador de espera del navegador, no un porcentaje ni una afirmación sobre el razonamiento interno de Gemini. Se conserva el timeout de tres minutos y la protección contra respuestas tardías.

La ruta actual es `google.script.run` → Apps Script → `UrlFetchApp.fetch` → respuesta completa → validación de escenarios → navegador. No transmite tokens durante la generación. La revelación progresiva es únicamente presentación del texto ya recibido. Un modo rápido puede reducir el razonamiento solicitado, pero estas pruebas no miden latencia de la API real.

Las respuestas de Gemini tienen únicamente **Copy message**. Las preguntas del usuario conservan **Edit and regenerate** para reconstruir la conversación desde ese punto.

El panel tiene entrada de 180 ms y salida de 150 ms. Al cerrar queda inmediatamente inactivo para teclado y lectores de pantalla. Abrirlo de nuevo cancela la salida anterior. Se respeta `prefers-reduced-motion`; durante el arrastre del grip se desactiva la transición del espacio lateral para evitar retrasos en el redimensionamiento.

## Instalar

Reemplazar estos **nueve archivos modificados de Apps Script** y actualizar la versión de la implementación web:

- `AnalysisStyles.html`
- `Assistant.html`
- `AssistantStyles.html`
- `Client.html`
- `ConfigService.gs`
- `GeminiService.gs`
- `ScenarioExplorer.html`
- `Settings.html`
- `WebApp.html`

Si la actualización anterior de DOE todavía no se instaló, incluir también `SimulationEngine.html` y `ScenarioEngine.gs` de la versión actual del repositorio. La primera contiene la validación de DOE con confiabilidad externa. No requiere Google Cloud ni servicios adicionales.

## Comprobación manual

1. What-If → Zero → Configure: activar DOE. Sus factores aún no están habilitados para selección.
2. Ejecutar Find best scenario; reabrir Configure. Elegir hasta cuatro factores habilitados y revisar Low/High. Intentar un quinto muestra un aviso.
3. Añadir un objetivo documentado de MTBF/MTTR en Medium o High, buscar y después seleccionar ese factor para DOE. Guardar/reabrir: se mantienen la selección y la justificación.
4. Cambiar un objetivo: los factores anteriores quedan pendientes de otra búsqueda.
5. Settings → Gemini (Advance): ajustar temperatura, modo y visualización; cerrar y reabrir para comprobar los valores.
6. Enviar una pregunta: comprobar indicador de espera y segundos. Al responder desaparece la actividad; las respuestas tienen Copiar, sin Editar. Las preguntas sí conservan Editar.
7. Expandir/colapsar Gemini rápidamente y arrastrar/soltar el grip. Con movimiento reducido, abrir y cerrar es inmediato.

## Validación local y límites

Los reportes JSON de esta versión registran la suite completa y pruebas en Chromium con RPC sintético. No se invocó Gemini real ni se actualizó o probó un despliegue real de Apps Script. Persisten tres fallos de interfaz anteriores a esta tarea, identificados en el reporte de suite.

Fuentes primarias consultadas para parámetros y transporte:

- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/generate-content/thinking
- https://developers.google.com/apps-script/guides/html/communication
- https://developers.google.com/apps-script/reference/url-fetch/http-response

## Otros archivos modificados en el repositorio

- `scripts/validate-interface-browser.mjs`
- `test/Interface.test.js`
- `test/GeminiService.test.js`
- `test/AppsScriptSettingsContract.test.js`
- `docs/37_DOE_VARIABLE_CATALOG.md` (marcado como versión anterior)
- `docs/38_SEARCH_DERIVED_DOE_AND_AGENT_RESPONSE.md`
- `docs/validation/2026-10-07-agent-response-browser.json`
- `docs/validation/2026-10-07-agent-response-suite.json`

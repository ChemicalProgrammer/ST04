# Additional options solo en Advance y rol de soporte Gemini

Additional options queda oculto en máquinas y conveyors de Basic. El manejador también impide abrir el diálogo en Basic. Advance conserva los campos y ejemplos. Los valores opcionales existentes/importados permanecen en la simulación: cambiar de modo no los elimina.

## Corrección del prompt inicial

La personalidad por defecto aún se presentaba solo como asistente de ingeniería y las reglas de análisis podían interferir con una pregunta de uso. Las preferencias guardadas de cada usuario también pueden contener textos antiguos o una restricción similar. Además, una negativa previa de Gemini permanece en el historial.

La corrección incluye:

- Personalidad inicial con dos funciones explícitas: guiar el uso de Flow Pilot y analizar líneas de empacado.
- Reglas de ingeniería aplicables a consultas de ingeniería; Basic permite respuestas de ayuda además de mejoras.
- Guía del producto y contrato fijo de soporte después de los prompts personalizados. Estos no pueden excluir la ayuda de uso de la app.
- Indicación de que una negativa previa del asistente es historial, no una definición vigente de su función.
- Para preguntas generales se utilizan únicamente los bloques personalizados de personalidad e idioma; se omiten análisis, CAPEX, búsqueda y escenarios. Se mantiene la guía y el contrato de soporte.
- Respuestas de navegación con pasos y etiquetas reales, sin inventar controles ni afirmar que se accionaron botones. La falta de información debe explicarse como incertidumbre concreta, no como una negativa por estar fuera del rol.

No hace falta borrar preferencias personalizadas ni el historial. La nueva versión añade el contrato a cada petición. Se conserva el selector General question / Current simulation y la comprobación de guardado para consultas del caso. La guía ahora indica que Additional options pertenece solo a Advance.

## Validación enfocada

30 pruebas del servicio Gemini aprobaron, incluyendo Basic/Advance × GENERAL/CASE con una personalidad guardada que excluye soporte y un historial con una negativa previa: todas las peticiones contienen el contrato fijo después de esa personalidad. También se verificó que GENERAL excluya las instrucciones de ingeniería personalizadas.

Dos pruebas UI verifican controles ocultos/no abribles en Basic, controles visibles en Advance, conservación de metadatos importados, validación y guardado del diálogo Advance. No se probó una llamada real al modelo: confirmar la respuesta tras actualizar el despliegue con una pregunta como “¿Sabes cómo funciona Flow Pilot? ¿Cómo guardo un caso?”.

## Archivos modificados

Apps Script:

- `apps-script/ApplicationGuide.gs`
- `apps-script/BasicModeStyles.html`
- `apps-script/EquipmentOptions.html`
- `apps-script/GeminiService.gs`

Pruebas/documentación:

- `test/GeminiService.test.js`
- `test/Interface.test.js`
- `docs/43_ADVANCE_OPTIONS_AND_GEMINI_SUPPORT_ROLE.md` (nuevo)

Actualizar el checkout, ejecutar `clasp push` y publicar una nueva versión del despliegue. No cambia el manifest ni el motor de simulación.

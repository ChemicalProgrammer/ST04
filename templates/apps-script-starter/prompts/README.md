# Prompts reutilizables

Estos prompts sirven para trabajar con Gemini u otro asistente sobre una versión concreta del proyecto. Sustituye los campos entre corchetes y adjunta los archivos relevantes. No incluyas credenciales ni registros personales reales cuando no sean necesarios.

| Prompt | Cuándo usarlo |
|---|---|
| `01_BASE.md` | Establecer reglas de trabajo al iniciar una conversación |
| `02_CONTEXT_AND_BATCHES.md` | Compartir estructura y archivos en varias tandas |
| `03_NEW_APPLICATION.md` | Convertir la plantilla en una aplicación nueva |
| `04_FEATURE_CHANGE.md` | Agregar o cambiar una función con alcance definido |
| `05_DEBUG.md` | Investigar un fallo reproducible |
| `06_REFACTOR.md` | Extraer componentes y reducir duplicación |
| `07_REVIEW.md` | Revisar cambios, datos y comportamiento |
| `08_DELIVERY_AND_DEPLOYMENT.md` | Preparar archivos, comprobaciones e instrucciones de actualización |

Orden recomendado: base, contexto y el prompt de la tarea. Usa revisión y entrega al terminar. Incluye `docs/ARCHITECTURE.md` y una versión o commit como referencia; no es necesario enviar archivos que no afectan a la tarea.

Si se envían archivos en tandas, lleva una lista de nombres y versiones. Envía una indicación explícita de fin de contexto antes de pedir la implementación. Una tanda de diez archivos es una organización práctica, no una garantía de que todo el contenido quedará disponible en conversaciones extensas.

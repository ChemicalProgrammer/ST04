# Prompt base para el desarrollo de ST01

## Cómo utilizarlo

Copia el prompt al iniciar una conversación de trabajo en Gemini. Adjunta un mapa del proyecto y los archivos relacionados con el cambio, indicando la versión o el commit de referencia. Si compartes archivos en varias tandas, indica cuándo terminaste de enviarlos y evita mezclar versiones.

Este documento sirve como instrucción de trabajo para futuras modificaciones del proyecto.

## Prompt

Trabaja sobre la versión del proyecto que te proporciono. Antes de modificar código, identifica los archivos afectados, sus dependencias y las funciones existentes que puedes reutilizar. Si te falta un archivo necesario, solicítalo antes de asumir su contenido.

Conserva la arquitectura, los nombres y los contratos actuales. Reutiliza los componentes, estilos, recursos de texto y funciones compartidas. Evita duplicar lógica y limita los cambios al objetivo solicitado.

Respeta las restricciones de Apps Script y la separación entre código del servidor y del navegador. Conserva la compatibilidad con casos y simulaciones guardados.

Entrega los archivos completos que deba actualizar e identifica cuáles son nuevos, modificados, renombrados o eliminados. Explica brevemente qué cambió, cómo verificarlo y qué no pudiste comprobar. No afirmes haber ejecutado pruebas si no las ejecutaste.

## Plantilla para solicitar un cambio

```text
Versión o commit de referencia:
[Indicar la versión de los archivos adjuntos]

Objetivo:
[Describir el cambio solicitado]

Comportamiento actual:
[Describir lo que ocurre y cómo reproducirlo]

Comportamiento esperado:
[Describir el resultado que se desea obtener]

Archivos adjuntos:
[Enumerar los archivos enviados y sus responsabilidades]

Restricciones:
[Indicar compatibilidad, diseño o comportamiento que debe conservarse]

He terminado de enviar los archivos de esta tarea.
Primero revisa el contexto y explica el diagnóstico o la propuesta.
Después realiza el cambio y entrega los archivos completos afectados,
junto con los pasos para comprobar el resultado.
```

# Adaptar la plantilla

1. Copia esta carpeta y conserva una versión de referencia antes de modificarla.
2. Cambia nombre, descripción y contactos en `AppConfig.gs`. Usa `DesignTokens.html` para modificar apariencia y `MotionStyles.html` para cambiar tiempos de transición.
3. Define la nueva entidad, sus campos, unidades, límites y estados antes de cambiar formularios.
4. Adapta la validación y el contrato del servicio de registros. Conserva los campos administrados por el servidor y la detección de conflictos.
5. Actualiza formulario, tarjetas y filtros para ese contrato. Reutiliza `AppApi`, `AppMotion`, `AppDialog` y `AppUI`.
6. Si cambias registros ya guardados, diseña una migración explícita de `schemaVersion`; no descartes información por defecto.
7. Actualiza pruebas, mapa de archivos e instrucciones de despliegue.

## Cuándo crear otro módulo

Crea un módulo cuando una responsabilidad tenga entradas y salidas claras, se use en varias pantallas o pueda verificarse de forma independiente. Evita dividir funciones pequeñas sin una razón funcional. Una nueva sección puede tener su propio módulo cliente y estilos, aprovechando tokens y utilidades existentes.

Los identificadores `PROJECTS_*` pertenecen a esta aplicación. Si reutilizas el mismo proyecto de Apps Script para otra finalidad, define cómo migrar o separar sus propiedades y carpetas antes de cambiar esos identificadores.

## Integración opcional de un asistente

Antes de agregar un proveedor de IA, define el alcance de datos que se enviará, qué operaciones puede proponer y cómo se revisarán. Guarda las credenciales por usuario en el servidor, nunca en HTML o documentos de prompts. Valida las propuestas igual que cualquier entrada. La integración no forma parte de esta versión.

## Cambio pequeño de ejemplo

Para agregar una prioridad, define sus valores, añade validación al servicio, establece el valor por defecto para registros existentes, agrega el control al formulario y actualiza el resumen de tarjetas. Comprueba que un proyecto anterior todavía abre y que una revisión desactualizada sigue siendo rechazada.

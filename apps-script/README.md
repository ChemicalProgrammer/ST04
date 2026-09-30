# Recursos de la aplicación

`TextResources.gs` reúne etiquetas, mensajes y ayudas de interfaz con claves descriptivas. Cambia los valores conservando las claves y los espacios de los fragmentos de mensajes. `DesignTokens.html` define los recursos visuales.

Los módulos usan `__ST_TEXT__('clave')` para cadenas JavaScript, `__ST_HTML_TEXT__('clave')` para texto en HTML dinámico y `<?= __ST_TEXT__('clave') ?>` en las vistas. Los textos se resuelven durante la generación o al cargar los módulos en Apps Script, sin solicitudes adicionales del navegador. Después de editar recursos, regenera los archivos con `npm run build:apps-script`.

El despliegue usa los archivos `.gs` y `.html` individuales de esta carpeta y `appsscript.json`. `Main.gs` carga `WebApp.html`, que incluye los módulos. No se generan `Code.gs` ni `Index.html`. Los módulos conservan la lógica de la aplicación; los identificadores técnicos, datos del usuario y parámetros del motor no son textos de interfaz.

Si el proyecto de Apps Script contiene `Code.gs` e `Index.html` de una versión anterior, elimínalos al actualizar los módulos. Conserva el manifiesto y sus permisos configurados. Las pruebas y la vista previa resuelven los módulos en memoria, sin crear archivos de despliegue duplicados.

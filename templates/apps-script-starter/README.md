# Apps Script Projects Starter

Base independiente para aplicaciones de registros por cuenta. Incluye una aplicación funcional de **Projects**: crear, consultar, editar, buscar, filtrar, exportar y eliminar proyectos.

## Qué incluye

- Bienvenida, header, navegación, tarjetas y panel lateral de edición.
- Diálogos, mensajes de error, indicador de actividad y animaciones reutilizables.
- Temas claro/oscuro/sistema y tres colores de acento.
- Preferencias por cuenta y caché local exclusivamente de apariencia.
- Persistencia en Drive: carpeta por cuenta y un archivo JSON por proyecto.
- Validación en servidor, bloqueo de escrituras y revisión para detectar conflictos.
- Confirmación al descartar cambios y recuperación del borrador tras un error de guardado.
- Prompts reutilizables y pruebas de servicios e interfaz.

La carpeta es autocontenida: puede copiarse a otro repositorio. Sus archivos `apps-script` pertenecen a **un proyecto nuevo de Apps Script**; no deben mezclarse con otra aplicación porque utilizan nombres de entrada como `doGet` y `getBootstrap`.

## Instalación

1. Crea un proyecto nuevo de Apps Script.
2. Copia todos los archivos de `apps-script/`: crea cada `.gs` como archivo de script y cada `.html` como archivo HTML, conservando los nombres. Conserva las etiquetas `<script>` y `<style>` de los módulos HTML.
3. Habilita la visualización del manifiesto y reemplaza su contenido por `apps-script/appsscript.json`.
4. Personaliza `AppConfig.gs`: nombre, descripción, nombre de carpeta y contactos del equipo. Los contactos incluidos son ejemplos.
5. Crea un despliegue de tipo aplicación web ejecutado como **usuario que accede a la aplicación**. El manifiesto parte de acceso `MYSELF` para la comprobación inicial. Para compartirlo, configura el acceso permitido por tu organización manteniendo la ejecución por usuario.
6. Abre la URL del despliegue y autoriza los permisos solicitados. Pulsa **Open workspace** y crea un proyecto.
7. Tras modificar código, actualiza el despliegue a una nueva versión y vuelve a cargar la página.

La carpeta se crea al guardar el primer proyecto, no al abrir la bienvenida. Si posteriormente pierde acceso o se elimina, la app informa del problema y no crea automáticamente un reemplazo que oculte los datos anteriores.

## Uso

1. **New project** abre un registro nuevo. Completa nombre, estado, fecha opcional y descripción; pulsa **Save project**.
2. Selecciona una tarjeta para editar. Los cambios se guardan manualmente.
3. **Refresh** actualiza la lista sin reemplazar el borrador abierto. **Reload** recupera el registro seleccionado después de confirmar el descarte del borrador.
4. **Export JSON** descarga el registro, incluyendo cambios locales; `draft: true` indica que todavía no están guardados. Esta base no incluye importación JSON.
5. **Delete** solicita confirmación y mueve el archivo del proyecto a la papelera.
6. **Settings** guarda tema y acento por cuenta. **Sign out** cierra el espacio de trabajo en esta página; no cierra la sesión del proveedor de identidad.

Si dos pestañas modifican el mismo proyecto, la segunda no sobrescribe el cambio silenciosamente. Conserva el borrador, permite exportarlo y solicita recargar antes de volver a guardar.

## Estructura

| Ruta | Responsabilidad |
|---|---|
| `apps-script/` | Archivos para desplegar en Apps Script |
| `docs/ARCHITECTURE.md` | Módulos, dependencias y contratos |
| `docs/ADAPTATION.md` | Cómo convertir la base en otra aplicación |
| `docs/PROVENANCE.md` | Fecha de extracción y componentes de origen |
| `docs/VERIFICATION.md` | Comprobaciones automáticas y manuales |
| `prompts/README.md` | Índice y forma de usar los prompts |
| `scripts/render.mjs` | Ensamblado local usado por las pruebas |
| `test/` | Pruebas con servicios y navegador sustituidos por fixtures |

## Pruebas locales

Desde esta carpeta, con una versión de Node compatible con las dependencias:

```bash
npm install
npm test
```

Las dependencias son de desarrollo. La aplicación desplegada no necesita Node, un bundler ni librerías de interfaz externas. Las pruebas no acceden a cuentas ni crean archivos reales en Drive.

## Alcance y extensiones

El almacenamiento es privado por cuenta; no se implementan colaboración entre usuarios, administración de permisos, historial de versiones propio, borradores persistentes ni adjuntos. Drive conserva sus capacidades habituales, pero la aplicación no expone una pantalla de recuperación.

La lista recorre los archivos del espacio de trabajo y está pensada para un volumen pequeño. Antes de usarla con miles de registros, agrega paginación e índice. Cerrar o recargar el navegador puede perder un borrador sin guardar; la advertencia de salida depende del navegador.

Una integración con Gemini puede agregarse después como módulo opcional. Esta plantilla no envía datos a un servicio de IA ni contiene llaves. Los prompts incluidos son documentos de trabajo para desarrollar la aplicación.

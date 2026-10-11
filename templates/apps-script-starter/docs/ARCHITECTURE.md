# Arquitectura y contratos

## Mapa de archivos desplegables

| Archivo | Responsabilidad |
|---|---|
| `AppConfig.gs` | Nombre, versión, estados y contactos |
| `Main.gs` | `doGet`, inclusiones y operaciones públicas |
| `ApiResponse.gs` | Respuestas uniformes y bloqueo de escritura |
| `AuthService.gs` | Identidad activa y verificación del usuario de ejecución |
| `SettingsService.gs` | Preferencias en propiedades del usuario |
| `StorageService.gs` | Carpeta, archivos y comprobación de propietario |
| `ProjectService.gs` | Validación, creación, actualización, eliminación y revisiones |
| `WebApp.html` | Estructura y orden de carga |
| `DesignTokens.html` | Colores, espacios, alturas y tipografía |
| `Styles.html` | Layout, tarjetas, formularios y adaptación móvil |
| `MotionStyles.html` | Duraciones y animaciones CSS compartidas |
| `Preferences.html` | Aplicación del tema y caché de apariencia |
| `Motion.html` | `AppMotion`: aparición, salida, paneles y cancelación |
| `ApiClient.html` | `AppApi.call`: transporte hacia el servidor |
| `Ui.html` | Iconos, notificaciones, exportación y confirmaciones |
| `Client.html` | Estado de la pantalla, edición y coordinación de servicios |
| `appsscript.json` | Entorno, permisos y despliegue inicial |

Los estilos y preferencias se cargan en el `head`. Al final del `body` se cargan Motion, ApiClient, Ui y Client en ese orden. Las inclusiones no hacen solicitudes de red adicionales al navegador.

## Operaciones públicas

Todas verifican la cuenta en el servidor mediante `api_`. Las funciones internas terminan en `_`.

| Operación | Entrada | Salida en `data` |
|---|---|---|
| `getBootstrap` | Ninguna | Cuenta, preferencias, configuración pública y resúmenes |
| `listProjects` | Ninguna | Lista de resúmenes |
| `getProject` | `id` | Registro completo |
| `createProject` | Campos editables | Registro creado |
| `saveProject` | `id`, `expectedRevision` y campos editables | Registro actualizado |
| `deleteProject` | `id`, `expectedRevision` | Identificador eliminado |
| `savePreferences` | `theme`, `accent` | Preferencias guardadas |

Respuesta satisfactoria: `{ "ok": true, "data": ... }`.

Respuesta fallida: `{ "ok": false, "error": { "code": "CONFLICT", "message": "..." } }`.

El transporte no reintenta escrituras automáticamente. Ante una respuesta perdida durante una creación, primero se debe refrescar la lista para evitar duplicarla.

## Registro persistido

```json
{
  "schemaVersion": 1,
  "id": "project-00000000-0000-0000-0000-000000000000",
  "ownerEmail": "account@example.com",
  "name": "Quarterly planning",
  "description": "Agree on the next steps.",
  "status": "PLANNED",
  "dueDate": "2026-12-15",
  "revision": 1,
  "createdAt": "2026-10-11T19:30:00.000Z",
  "updatedAt": "2026-10-11T19:30:00.000Z"
}
```

El ejemplo ilustra el formato; no representa un registro creado. Campos editables: `name` (1–120 caracteres), `description` (hasta 4.000), `status` y `dueDate` (fecha válida o cadena vacía). El servidor define identificador, propietario, revisión y timestamps.

Cada archivo se llama `<id>.json`. La propiedad de usuario `PROJECTS_FOLDER_V1` guarda la carpeta; `PROJECTS_PREFERENCES_V1` guarda las preferencias. No se aceptan IDs de archivo o carpeta suministrados por el cliente para leer registros.

Al actualizar o eliminar, `expectedRevision` debe coincidir con la revisión persistida. La comprobación y escritura ocurren dentro del mismo bloqueo por usuario. Los propietarios se verifican aun si varias cuentas terminaran apuntando a la misma carpeta.

## Estado de interfaz

`Client.html` mantiene la lista, el registro seleccionado, el estado de cambios pendientes y el de operación en curso. Los campos se muestran mediante APIs DOM y `textContent`; el contenido del usuario no se interpreta como HTML. Una operación fallida conserva el formulario.

La interfaz deshabilita controles durante una operación para evitar envíos simultáneos. El panel se coloca debajo del header; su posición se actualiza si el header cambia de altura. Al cerrar el espacio de trabajo se limpia la lista y el formulario de la sesión local.

## Permisos

El manifiesto pide acceso a Drive para administrar los archivos de la aplicación y acceso al correo de la cuenta para comprobar la identidad. No solicita acceso externo a servicios HTTP. La ejecución debe ser por usuario; la comprobación de identidad rechaza un despliegue que opere como otra cuenta.

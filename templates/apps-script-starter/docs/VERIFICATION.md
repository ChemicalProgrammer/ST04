# Verificación

## Automatizada

Ejecuta `npm test` desde la carpeta de la plantilla. Las pruebas usan la lógica real de los servicios, con sustitutos en memoria para identidad, propiedades, Drive y bloqueo; la interfaz se ejecuta en JSDOM.

Se comprueba:

- Creación, lectura, actualización y eliminación.
- Rechazo de versiones desactualizadas y conservación del registro cuando falla una escritura.
- Separación de cuentas, incluso ante una carpeta compartida por error.
- Validación de campos y preferencias.
- Rechazo de carpetas inaccesibles sin reemplazarlas silenciosamente.
- Inclusiones, sintaxis JavaScript/CSS e identificadores DOM únicos.
- Flujos de edición, filtros, confirmación de descarte, conflictos y preferencias.
- Presentación de texto del usuario sin interpretarlo como markup.

## En el despliegue

1. Autoriza la aplicación y comprueba que el correo mostrado corresponde a la cuenta que accede.
2. Crea un proyecto, recarga la página y verifica su contenido.
3. Abre el mismo proyecto en dos pestañas. Guarda desde una y comprueba que la otra recibe un conflicto si intenta guardar la revisión anterior.
4. Prueba filtros, exportación, eliminación con confirmación y cierre del panel con cambios pendientes.
5. Cambia tema y acento; comprueba persistencia y legibilidad en una pantalla pequeña.
6. Revisa navegación por teclado, foco de diálogos y preferencia de movimiento reducido.
7. Si habilitas acceso para otras cuentas, verifica que cada una obtiene su propio espacio.

Las pruebas locales no comprueban permisos reales, cuotas, disponibilidad de Drive ni renderizado visual en un navegador real. Esa validación se completa con la URL del despliegue.

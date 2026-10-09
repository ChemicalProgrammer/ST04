# Estrategia de pruebas para Code Assist

## Regla de entrega

Escribir pruebas no significa ejecutarlas. Ninguna etapa está terminada solo porque
el código parece correcto. Registrar comando, resultado, cantidad real de pruebas
y pendientes en docs/BUILD_STATUS.md del proyecto nuevo.
Si el entorno no permite ejecutar, decir NO EJECUTADO y no declarar verificación.
Usar exclusivamente fixtures sintéticos, mocks Google y claves ficticias.

## Matriz mínima

| Área | Pruebas de referencia | Evidencia requerida |
|---|---|---|
| Matemáticas | LineSimulationEngine.test.js, ConveyorEngineering.test.js | Repetibilidad completa, geometría, transporte congelado, Prime, debounce Back-up, fallas, OEE |
| Formatos/demo | FormatLineTemplate.test.js, DemoCaseFactory.test.js | Secuencia 13 objetos, NA explícito, demo ejecutable y procedencia sintética |
| Casos/settings | CaseEditorContract.test.js, AppsScriptSettingsContract.test.js | Borradores, propiedad, revisión obsoleta, conservación de parámetros y configuración segura |
| Importación | SheetImport.test.js, SheetImportMerge.test.js | 23 columnas + metadatos, porcentajes, errores por celda, permisos, preview selectivo, cancelación y preservación de otras simulaciones |
| Gemini | GeminiService.test.js | Propiedad antes de HTTP, ninguna clave en bootstrap, errores saneados, contexto guardado |
| UI | Interface.test.js | Entrada Cases, navegación, guardar/reabrir/clonar/comparar, temas, accesibilidad, reordenamiento, importación y Gemini |
| Recursos | TextResources.test.js | Claves faltantes, escape seguro, propagación estática/dinámica |
| Ensamblado | BrowserEngineBundle.test.js, ManualAppsScriptBundle.test.js | Motor Node/browser equivalente, includes resueltos, contratos conservados |

Las filas corresponden a suites existentes, no significan que cubran todos los
casos futuros. Añadir pruebas de propiedad/concurrencia, semilla inicial y límites
si la implementación nueva amplía ese comportamiento.

## Comandos de referencia

Solo ejecutar en un entorno autorizado y con dependencias disponibles:
- npm ci: instalar dependencias del lockfile existente; no asumir que Node está instalado.
- npm run build:apps-script: regenerar motor y bundles.
- npm test: ejecutar suite completa.
- node --test test/LineSimulationEngine.test.js: ejemplo de suite focalizada.

En una carpeta vacía crear primero package.json y pruebas; generar lockfile mediante
el gestor autorizado antes de usar npm ci. No marcar tests antiguos como pasados en
un proyecto nuevo donde todavía no existen.
Reconstruir dos veces y comprobar salidas idénticas y ausencia de includes pendientes.
Si los tests regeneran bundles, revisar cambios producidos antes de guardar.

## Integración incremental

Cada capacidad debe incluir al menos un recorrido completo UI → RPC mock → estado
persistido → recarga. No esperar a que todos los archivos estén terminados.
Conservar pruebas anteriores. No modificar expectativas para ocultar una regresión.
Si se tiene acceso autorizado al motor de referencia, comparar fixtures idénticos
entre versiones (resultados, muestras, eventos). Si no, declarar equivalencia pendiente.
No asumir que un mismo MTBF implica idéntico tiempo perdido en una corrida corta.

## Validación final fuera de mocks

Revisar en navegador real Light/Dark/System, 25 acentos, contraste/foco,
teclado/drag, modal con scroll interior, paneles redimensionables y viewport pequeño.
jsdom no verifica fielmente layout, animaciones ni foco nativo.

En despliegue de PRUEBA autorizado: login, identidad ejecutora, carpeta Drive,
crear/guardar/reabrir/clonar, Sheets de datos sintéticos, permisos OAuth, consulta
Gemini con clave del usuario y limpieza de sesión. No tocar producción.
Mocks no prueban cuotas, OAuth, APIs externas ni política corporativa.
No registrar datos privados en logs/screenshots ni adjuntarlos al asistente.

## Cierre

Entregar archivos tocados, contratos cambiados, pruebas y salida real, limitaciones,
pasos manuales pendientes y diff revisable. La integración aprobada requiere motor,
cliente, servidor y bundles compatibles; una pantalla bonita no es aceptación.

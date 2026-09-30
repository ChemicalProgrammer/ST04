# ST

Aplicación web con Apps Script, almacenamiento en Drive e integración con Gemini.

- Textos de interfaz: `apps-script/TextResources.gs`.
- Colores, tipografía, tamaños y espaciado: `apps-script/DesignTokens.html`.
- Vistas y controladores: módulos en `apps-script/`.
- Reconstrucción desde Gemini Pro (chat): [Gemini](Gemini/README.md).
- Documentación histórica: `docs/`.
- Reconstrucción con Gemini Code Assist: [Visual Code](Visual%20Code/docs/README.md).

`npm run build:apps-script` actualiza los adaptadores del motor (`SimulationEngine.html` y `ScenarioEngine.gs`). El despliegue usa todos los módulos `.gs` y `.html` de `apps-script/` y su manifiesto. Si existen `Code.gs` e `Index.html` en un proyecto de Apps Script anterior, elimínalos: ya no forman parte del despliegue. `npm test` ejecuta las pruebas.

En **Line Setup**, cada equipo permite editar **MTBF (min)** y **MTTR (min)** y activar/desactivar **Failures enabled**. Los valores alimentan `noiseProfile.reliability` y se conservan en `processData.equipment`; desactivar fallas conserva los tiempos para volver a activarlas.

**Import JSON**, junto a **Import Sheet**, permite abrir un archivo JSON (hasta 6 MB) o pegar su contenido. **Edit JSON**, en la vista JSON, abre la configuración de la simulación activa. Ambos usan un borrador independiente: **Validate and Apply** valida y actualiza la interfaz; **Cancel** descarta el borrador. Se acepta el formato exportado `st-line-configuration-v1` o un objeto con `equipment` y, opcionalmente, `dynamicConfig`. Se validan la estructura, los identificadores, las reglas físicas y la confiabilidad. Esta interfaz requiere `tickSeconds: 0.25`.

La aplicación conserva la identidad del caso y la simulación, así como las otras simulaciones. La configuración compartida `engineConfig` y la unidad del caso deben coincidir. Aplicar una configuración descarta los resultados anteriores de la simulación activa y activa el guardado automático; los errores de guardado siguen disponibles para reintento.

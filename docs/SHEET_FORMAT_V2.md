# Formato actualizado de importación y exportación

La exportación a Google Sheets utiliza el formato `plant-sheet-v2`, con datos del caso en C1:C7, encabezados en la fila 9 y equipos desde la fila 10. Se mantienen A–F; las dos nuevas columnas desplazan las columnas anteriores G–W a I–Y.

| Columna | Dato | Uso |
| --- | --- | --- |
| G | Conveyor Speed (m/min) | Velocidad física explícita del conveyor; activa velocidad manual al importar. |
| H | Accumulation (s) | Tiempo declarado conservado como referencia y exportado sin convertirlo en capacidad. |
| I | Total length (mm) | Antes G. |
| J | Prime zone (mm) | Antes H. |
| S | Speed factor vs discharge (%) | Antes Q. |
| Y | Overspeed vs infeed screw (%) | Antes W. |

La velocidad se convierte internamente de m/min a mm/s multiplicando por 1000/60. Por ejemplo, 29.93 m/min equivale a 498.833333… mm/s. Al aplicar una velocidad explícita se desactivan los objetivos de Population/Overspeed que pudieran sustituirla. La velocidad de conveyors AUTO se resuelve a partir de la geometría para exportar; si no se puede resolver, G se deja NA. Importar una velocidad numérica de G selecciona modo MANUAL, aunque la simulación exportada usara AUTO; JSON conserva todos los modos y opciones originales.

H se guarda en `processData.accumulation.declaredAccumulationSeconds`. No modifica MTBF, MTTR, sensores ni longitud. La capacidad simulada sigue determinada por geometría y separación del producto. Falta definir si H es una medición, un objetivo o un tiempo de diseño antes de utilizarlo como restricción del motor.

Los encabezados G/H identifican el formato nuevo. Las hojas anteriores mantienen el mapeo A–W. Un encabezado parcial o con unidades diferentes se rechaza para evitar desplazamientos silenciosos. El resumen de tiempos identificado por “Total Time”, debajo de la tabla, se excluye de los equipos.

En Preview se pueden seleccionar G y H por separado. Se conservan las referencias a las celdas desplazadas y los archivos del caso. La exportación crea una nueva Google Sheet y no modifica la hoja fuente.

## Tamaño del envase en C4

C4 admite una cantidad positiva con su unidad, por ejemplo `500 mL`, `1 L`, `12 oz` o `250 g`. Se conserva la cantidad y la unidad al exportar, sin convertir entre unidades. Una celda numérica puede tomar la unidad de su formato visible o del rótulo A4:B4, por ejemplo `Container size (mL)`. La unidad explícita de C4 tiene prioridad. Un número sin unidad se conserva sin asumir onzas. La etiqueta exportada es `Container size`.

Los datos se guardan en `metadata.containerSize`; `containerSizeOz` se conserva por compatibilidad solo cuando se han declarado onzas. Los casos anteriores que solo tienen `containerSizeOz` se exportan con `oz` explícito. El tamaño del envase es metadata; la propuesta opcional de producto puede copiar su volumen cuando tiene una unidad explícita reconocida, pero no lo convierte en dimensiones geométricas.

## Propuesta de producto y formato al importar

Preview incluye **Product and packing format**. La propuesta utiliza la línea resultante de las filas y campos seleccionados, respetando los IDs y el orden instalado. Al reconocer un `Case Packer`, propone botellas antes de él, botella → caja en esa máquina y cajas después. Si hay varios candidatos, se debe elegir explícitamente uno y revisar la tabla de flujo. Es un modelo de línea en serie; el nombre no describe ramificaciones ni alimentaciones auxiliares.

- En un caso sin catálogo y con un único Case Packer se activa la propuesta. Se puede desmarcar para aplicar únicamente los campos de equipos seleccionados.
- C3 propone el nombre del formato; C5 propone botellas por caja. El nombre del producto es editable. Una cantidad faltante de botellas por caja requiere introducirla; no se asume 12.
- La longitud del producto se propone desde Package length de los conveyors anteriores al Case Packer; la longitud de caja, desde los posteriores. Solo se propone una longitud común cuando las mediciones coinciden. Si no coinciden, el campo queda vacío y cada conveyor conserva su valor predeterminado. Ancho y altura no se inventan.
- Discharge gap y Moving gap se obtienen como Discharge pitch menos longitud del producto/caja; Infeed gap, como Infeed pitch menos esa longitud. Una separación negativa requiere revisión. No hay datos suficientes para deducir una separación de acumulación diferente.
- Longitud instalada, Prime, descarga, codificación, sensores, velocidad física manual y MTBF/MTTR permanecen en los equipos/conveyors. Las velocidades de máquinas se heredan de esos valores predeterminados, sin crear overrides redundantes en producto/formato.

**Source machine speeds** exige elegir cómo están expresados los datos de F:

| Opción | Interpretación |
| --- | --- |
| Bottle equivalents/min | Las velocidades de salida del Case Packer y de los pasos posteriores se dividen entre botellas por caja. Por ejemplo, 300 / 12 = 25 cajas/min. |
| Native output/min | Las máquinas anteriores están en botellas/min; Case Packer y máquinas posteriores ya están en cajas/min. No se divide. |

G contiene velocidad física: nunca se divide entre botellas por caja. Al revisar una exportación anterior, comprobar la base de F: las exportaciones de equipos conservan las velocidades nativas configuradas. El selector permite distinguirlas de hojas de planta expresadas completamente en botellas/min.

Al aplicar se añaden un producto y un formato, se asignan las unidades físicas y se selecciona el nuevo formato inicial en la simulación activa, con el motor ST. El formato enlaza el producto para los equipos con botellas y la presentación de caja para los pasos con cajas. Seleccionarlo no precarga inventario. Se invalidan los resultados de esa simulación; las demás simulaciones y sus resultados se conservan. Los cambios se guardan con el mecanismo normal del caso; se puede cancelar la vista previa sin aplicarlos.

Si ya existe catálogo, crear otro producto/formato es opcional y está desactivado por defecto. Se conservan los registros y overrides existentes; revisar Products/Formats si cambian sus mediciones. Para recargas de la misma hoja se registra la base de velocidades y el tamaño de caja utilizados, evitando volver a dividir velocidades ya traducidas. Los valores fuente permanecen en la procedencia de importación.

## Actualización de Apps Script

Para esta mejora, actualizar juntos `ClientCases.html`, `SheetImportService.gs`, `SheetImport.html`, `SheetImportMerge.html` y `SheetImportStyles.html` junto con el resto de la aplicación. Actualizar el despliegue y volver a abrir el diálogo de importación. No se requieren cambios del motor ni reconstruir `SimulationEngine.html`.


## Celdas indicadas en los avisos de importación

Los avisos de revisión física y los indicadores de las tarjetas muestran las celdas relacionadas y el nombre del campo, según el formato detectado. Por ejemplo, Package length / Discharge pitch / Speed factor corresponden a K11 / L11 / Q11 en v1 y M11 / N11 / S11 en v2. Al recargar una fila movida o asignarla a un equipo existente se usa la fila de la importación actual.

Los valores derivados, como el paso efectivo, indican sus entradas de cálculo. Back-up y Back-up restart no tienen una celda dedicada en esta plantilla: el aviso lo aclara, muestra las entradas relacionadas y remite a Conveyors → Line setup. Los parámetros exclusivos del simulador tampoco se presentan como datos faltantes de una columna inexistente. Sin una fila fuente vinculada, se indica revisar la configuración en la app.

Las advertencias de longitud compartida y separación del producto/formato también señalan Package length y el pitch correspondiente. La cantidad de botellas por caja remite a C5; el nombre del formato, a C3.

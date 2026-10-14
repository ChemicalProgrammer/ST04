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

Los datos se guardan en `metadata.containerSize`; `containerSizeOz` se conserva por compatibilidad solo cuando se han declarado onzas. Los casos anteriores que solo tienen `containerSizeOz` se exportan con `oz` explícito. El tamaño del envase es metadata y no cambia el tamaño geométrico del producto ni el motor.

## Actualización de Apps Script

Actualizar juntos: `SheetImportService.gs`, `SheetExportService.gs`, `SheetImport.html`, `SheetImportMerge.html` y `SheetImportCorrections.html`. Actualizar el despliegue y volver a abrir el diálogo de importación. No se requieren cambios del motor ni reconstruir `SimulationEngine.html`.

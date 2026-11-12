# Análisis de la hoja de diseño por conveyor

La hoja dimensiona el conveyor entre dos máquinas. Las columnas L, M y N representan formatos del mismo conveyor. Se calcula la necesidad de espacio y la recuperación por formato, y luego se comprueba el diseño común con el mayor Overflow y el menor Lrec. El ejemplo de las capturas es **Labeller → Case Packer**, formato 1. Las longitudes se expresan en mm, la velocidad lineal en m/min y el flujo en paquetes/min. Un paquete es el objeto que circula por ese conveyor, ya sea botella o caja.

## Cotas y posiciones del croquis

El origen `x = 0` está en la descarga de la máquina aguas arriba y `x` aumenta en el sentido del flujo. En un conveyor curvo, `x` es distancia recorrida sobre el eje del conveyor.

| Cota o marcador | Celda | Ubicación y significado |
| --- | --- | --- |
| Discharge | D8, entrada | Desde la descarga de la máquina hasta el comienzo de Coding. |
| Coding | E8, entrada | Desde el final de Discharge hasta el Max Run-out point. Puede ser cero cuando el tramo no existe. |
| Max Run-out point | D8 + E8 | Frontera entre Coding y Overflow en el croquis. |
| Overflow | F8, máximo de L58:N58 | Desde el Max Run-out point hasta la posición de diseño del sensor Back-up. Reserva espacio para el producto que sigue llegando durante un paro. |
| Lbu | E11 | Desde la descarga aguas arriba hasta Back-up de diseño. Suma Discharge, Coding y Overflow. |
| Back-up (B) | Posición de diseño E11 | Marca el extremo aguas arriba de Lba. Si se midió la posición del sensor instalado, mostrar esa posición con su propia procedencia. |
| Lba | I11 | Desde Back-up de diseño hasta Prime. Según el croquis, Lact menos Lp menos Lbu. |
| Rec Pt. | Lact − Lp − Lrec | Punto calculado donde el primer paquete nuevo alcanza la cola durante el reinicio. |
| Lrec | K8, mínimo de L70:N70 | Desde Rec Pt. hasta Prime. El rótulo «(min)» indica el mínimo entre formatos. La fila 70 confirma que la unidad es mm. |
| Prime (P) | Lact − Lp | Punto de referencia aguas abajo de Lba. |
| Lp | L8, entrada | Desde Prime hasta la entrada de la máquina aguas abajo. |
| Lact | I13, entrada | Longitud instalada entre las dos máquinas. |

Para 2D, colocar Discharge, Coding, Overflow, Lrec y Lp en la primera fila de cotas, Lbu y Lba en la segunda y Lact en la tercera. Colocar B, P y Rec Pt. encima del conveyor. Los textos se anclan al centro de su propio tramo. Si un tramo corto no admite texto, usar una llamada con línea guía o una etiqueta desplazada. Si Lrec es negativo, mostrar el valor con signo y una advertencia junto a Prime. Un cero explícito significa longitud nula y un dato ausente se muestra como pendiente. Si una posición de diseño difiere de la instalada, el trazado debe identificar ambas cuando se muestren juntas.

En el ejemplo, D8 = E8 = 0. Usando las cotas redondeadas del croquis, B de diseño está a 1,163 mm del origen, Rec Pt. a 3,153 mm, P a 4,953 mm y la entrada aguas abajo a 5,953 mm. Lrec forma parte de Lba.

## Inventario de celdas

Las fórmulas de las tablas conservan las referencias recibidas, salvo mayúsculas y espacios. Las alternativas de cálculo se documentan aparte.

### Geometría común

| Celda | Concepto | Entrada o fórmula recibida |
| --- | --- | --- |
| D8 | Discharge, mm | Entrada |
| E8 | Coding, mm | Entrada |
| F8 | Overflow de diseño, mm | `=MAX(L58:N58)` |
| E11 | Lbu, mm | `=D8+E8+F8` |
| I11 | Lba, mm | `=I13+E11-L8` |
| I13 | Lact, mm | Entrada |
| K8 | Lrec de diseño, mm | `=MIN(L70:N70)` |
| L8 | Lp, mm | Entrada |

### Producto, máquinas y velocidades por formato

| Celda | Concepto | Entrada o fórmula recibida |
| --- | --- | --- |
| L16 | Longitud del paquete en sentido de marcha, mm | Entrada |
| L19 | Paso de descarga aguas arriba, centro a centro, mm | Entrada |
| L20 | Tiempo de arranque aguas arriba, s | Entrada |
| L21 | Paquetes descargados tras la orden de paro | Entrada |
| L22 | Velocidad nominal aguas arriba, paquetes/min | Entrada |
| L23 | Velocidad lineal de salida aguas arriba, m/min | `=L22*L19/1000` |
| L24 | Flujo aguas arriba como longitud de producto contiguo, m/min | `=L22*L16/1000` |
| L27 | Velocidad alta aguas abajo, paquetes/min | Entrada |
| L28 | Paso de entrada aguas abajo, centro a centro, mm | Entrada |
| L29 | Rampa aguas abajo hasta velocidad plena, incluido el retardo de Prime, s | Entrada |
| L30 | Consumo aguas abajo como longitud de producto contiguo, m/min | `=L27*L16/1000` |
| L33 | Factor de velocidad de Discharge respecto a L23 | Entrada porcentual |
| L34 | Velocidad de Discharge, m/min | `=L23*(1+L33)` |
| L35 | Fracción longitudinal ocupada en Discharge | `=L$24/L34` |
| L36 | Factor de velocidad de Coding respecto a L34 | Entrada porcentual |
| L37 | Velocidad de Coding, m/min | `=L34*(1+L36)` |
| L38 | Fracción longitudinal ocupada en Coding | `=L24/L37` |
| L39 | Factor de velocidad del tramo principal respecto al anterior | Entrada porcentual |
| L40 | Velocidad del tramo principal, m/min | Entrada |
| L41 | Fracción longitudinal ocupada en el tramo principal | `=L24/L40` |
| L45 | Tiempo de paso de un paquete frente a Back-up, s | `=L16/1000/L40*60` |
| L46 | Retardo para confirmar Back-up bloqueado, s | Entrada |
| L48 | Retardo para confirmar Back-up libre, s | Entrada |

En las fórmulas recibidas, L40 es una entrada independiente de L39. El ejemplo muestra L39 = 0 % y L40 = 42.4 m/min, frente a los 18.8 m/min de Coding. L20 y L29 tampoco intervienen en las fórmulas recibidas para Lrec.

### Overflow por formato

| Celda | Concepto | Entrada o fórmula recibida |
| --- | --- | --- |
| L51 | Paquetes que salen durante el retardo de Back-up bloqueado | `=L46*L22/60` |
| L52 | Paquetes que salen tras la señal de paro | `=L21` |
| L53 | Paquetes en tránsito en Discharge | `=$D$8*L35/L16` |
| L54 | Paquetes en tránsito en Coding | `=$E$8*L38/L16` |
| L55 | Margen por paquetes adicionales | Entrada |
| L56 | Total de paquetes a absorber | `=SUM(L51:L55)` |
| L57 | Longitud de esos paquetes contiguos, mm | `=L56*L16` |
| L58 | Longitud de Overflow necesaria, mm | `=L57/(1-L41)` |

L58 dimensiona el tramo usando la fracción libre en movimiento. Si L41 es igual o superior a 100 %, ese modelo de cálculo queda fuera de rango. Conservar las fracciones de paquetes para reproducir la hoja y aplicar el redondeo solo al mostrar resultados.

### Recuperación, acumulación y velocidad recomendada

| Celda | Concepto | Entrada o fórmula recibida |
| --- | --- | --- |
| L61 | Retardo de Back-up libre, s | `=L48` |
| L62 | Tiempo desde el arranque aguas arriba hasta que sale el primer paquete, s | Entrada |
| L63 | Tránsito por Discharge, s | `=$D$8/L$34/1000*60` |
| L64 | Tránsito por Coding, s | `=$E$8/L37/1000*60` |
| L65 | Tránsito por el Overflow de diseño común, s | `=$F$8/L40/1000*60` |
| L66 | Tiempo hasta que el primer paquete llega a Back-up, s | `=SUM(L61:L65)` |
| L67 | Longitud consumida de la cola hasta ese instante, mm | Transcripción ambigua `L2/*L16/60*L66*` |
| L68 | Tiempo adicional para alcanzar la cola, s | `=(L67/1000)/(L40-L30)*60` |
| L69 | Longitud adicional consumida de la cola, mm | `=L30/60*L68*1000` |
| L70 | Margen Lrec por formato, mm | `=$I$11-L69-L67` |
| L73 | Tiempo anti-starve con conveyor normalmente lleno, min | `=$I$11*(1-L414)/L16/L27` |
| L74 | Tiempo anti-starve, s | `=L73*60` |
| L75 | Tiempo anti-block con conveyor normalmente vacío, min | `=$I$11*(1-L41)/L16/L22` |
| L76 | Tiempo anti-block, s | `=L75*60` |
| L79 | Sobrevelocidad respecto a la velocidad de entrada aguas abajo | Entrada porcentual |
| L80 | Velocidad mínima recomendada de entrada, m/min | `=L28*L28/1000*(1+L79)` |

L68 presupone que el paquete que viene por el conveyor alcanza una cola cuyo extremo retrocede en el sentido de marcha conforme la máquina aguas abajo la consume. El modelo de la hoja requiere L40 > L30 para calcular el alcance. L62 vale 2 s en el ejemplo y L20 vale 1 s. Si se mide L62 desde la orden efectiva de rearranque hasta la primera salida, hay que evitar sumar otra vez un retardo que ya esté incluido en esa medición.

## Verificación con el ejemplo de las capturas

Se reconstruyó el formato mostrado a partir de 98 mm de longitud y paso de descarga, 192 paquetes/min aguas arriba, 175 paquetes/min aguas abajo, 42.4 m/min de banda, retardos B de 0.50 s, 2 paquetes tras paro y margen de 3 paquetes. Para verificar Lrec se usaron Lba = 3,790 mm, L62 = 2 s y el Overflow calculado para el formato visible, que redondea al valor común mostrado. Las otras columnas se necesitan para confirmar qué formato gobierna cada extremo.

| Resultado | Reconstruido | Captura |
| --- | ---: | ---: |
| Ocupación del conveyor en movimiento, L41 | 44.38 % | 44 % |
| Paso del paquete por B, L45 | 0.139 s | 0.14 s |
| Longitud de Overflow, L58 | 1,162.84 mm | 1,163 mm |
| Primera llegada a B, L66 | 4.146 s | 4.1 s |
| Consumo de cola hasta B, L67 | 1,184.93 mm | 1,185 mm |
| Tiempo adicional hasta alcanzar la cola, L68 | 2.816 s | 2.8 s |
| Consumo adicional de cola, L69 | 804.81 mm | 805 mm |
| Margen Lrec, L70 | 1,800.26 mm | 1,800 mm |
| Anti-starve con L414 vacía, L74 | 13.26 s | 13.3 s |
| Anti-block, L76 | 6.72 s | 6.7 s |

| Referencia por confirmar | Evidencia y tratamiento |
| --- | --- |
| I11, signo de E11 | La transcripción da 6,116 mm. El croquis define Lact − Lp − Lbu y da 3,790 mm con las cifras impresas. Usar esta última relación para interpretar la geometría y verificar el signo en la hoja original. |
| L67, referencia incompleta | `=L27*L16/60*L66` reproduce el valor mostrado y tiene unidades de mm. También equivale a `=L30*1000/60*L66`. |
| L73, referencia L414 vacía | Tratándola como cero se reproducen 13.3 s y el supuesto de cola llena. Sustituir L414 por L41 daría 7.4 s. Confirmar el criterio de inventario antes de cambiar la fórmula. |
| L80, paso repetido | Con paso de 141 mm y sobrevelocidad de 5 %, la fórmula transcrita reproduce 20.9, pero multiplica mm por mm. Usando velocidad alta × paso × (1 + sobrevelocidad) / 1,000 resulta 25.91 m/min. Confirmar si la fórmula original tiene una referencia incorrecta. |

## Comparación con SimuLine (ST04)

Revisión de `main` en `583a083`. El cálculo de ingeniería está en [ConveyorEngineering.js](../src/simulation/ConveyorEngineering.js), la resolución de geometría y procedencia en [FormatGeometryAdapter.js](../src/simulation/FormatGeometryAdapter.js), y el dibujo en [Simulation2D.html](../apps-script/Simulation2D.html).

| Tema | Qué tiene ST04 | Qué falta para reproducir la hoja |
| --- | --- | --- |
| Geometría | Resuelve longitud utilizable, Lp/sensor Prime y Back-up. Maneja longitudes de Discharge/Coding y admite Lba manual. | Verificar que Lact de la hoja corresponda a los mismos extremos físicos que la longitud utilizable de cada conveyor. Identificar si B es medido o de diseño. Conservar el Lba manual como valor operativo donde aplique. |
| Velocidad y ocupación | Tiene velocidades estimadas de Discharge/Coding, velocidad del conveyor configurable, factores de velocidad, ocupación, longitud del producto y pasos de movimiento y acumulación. | Confirmar qué velocidades corresponden a tramos físicos y guardar la velocidad de banda de L40 por formato cuando sea distinta. Identificar si los factores son datos medidos o criterios de diseño. |
| Sensores y paro | Usa retardos de bloqueo/liberación, paquetes descargados tras paro y margen de paquetes. Puede calcular el tiempo de paso ante el sensor. | Confirmar los valores de los temporizadores y que el número de paquetes tras paro esté en la unidad del conveyor. En la simulación, la descarga tras paro depende del inventario disponible. |
| Overflow | Calcula el producto que llega durante el retardo, tras el paro y por margen. Lo convierte en longitud con el paso efectivo y agrega Discharge/Coding para obtener Lbu. | La hoja agrega primero el inventario de Discharge/Coding y divide la longitud compactada por la fracción libre. Hacer ese cálculo por formato y obtener el máximo para F8. |
| Recuperación | Usa retardo B libre, arranque y un tiempo de tránsito a velocidad principal. El término adicional usa el espacio restante y suma la velocidad de banda y consumo en el denominador. | Usar tiempos por tramo, capturar L62 por separado y calcular L68 con L67 y la diferencia de velocidades para comparar con la hoja. Obtener el mínimo Lrec entre formatos válidos. |
| Tiempos anti-starve y anti-block | Anti-starve usa la ocupación de movimiento y anti-block usa la fracción libre. Calcula también una reserva mínima durante una rampa aguas abajo. | Comparar anti-starve con inventario lleno bajo el criterio observado en L73. Mantener separado el consumo durante la rampa y confirmar si el retardo Prime está incluido en el dato de rampa. |
| Velocidad recomendada de entrada | Usa velocidad alta, paso de entrada y sobrevelocidad. | Confirmar la referencia L80 con la hoja. El cálculo de ST04 ya usa unidades coherentes. |
| Cotas 2D | Dibuja las cotas del formato activo, ancla los textos a cada tramo y usa geometría operativa para parte del trazado. | Añadir el cálculo común para mostrar F8/K8, indicar qué formato gobierna cada uno y mantener los tramos del croquis anclados a una misma geometría de diseño. |

## Aplicación propuesta

1. **Diagnóstico por conveyor.** Reutilizar la geometría y los parámetros disponibles en el caso y evaluar cada formato activo. Calcular primero L58 de todos los formatos válidos. Usar su máximo para Lbu y Lba comunes y luego evaluar L70 por formato. Mostrar el formato que gobierna cada extremo, los datos pendientes y la fuente de cada valor. Si faltan formatos activos, marcar el resultado común como parcial. Priorizar Lact, Lp o posición de P, posición medida de B si existe, Discharge/Coding, velocidad física por tramo y L62. Separar longitud del paquete y paso centro a centro. Cuando el tramo mueve cajas, convertir a cajas/min y cajas tras paro según el formato.
2. **Simulación numérica.** Usar Overflow, Lrec y tiempos de acumulación como diagnósticos para comparar paros por bloqueo o falta de producto, tiempos de recuperación y nivel de cola. La aplicación al motor requiere confirmar que los tramos tengan velocidades físicas independientes. En ese caso, incorporar tránsito por tramo, sensores en sus posiciones reales y salida tras paro limitada por inventario. La reserva de Overflow es una porción del conveyor y no se suma otra vez como capacidad adicional.
3. **Simulación 2D.** Añadir las cotas comunes como una capa de diseño y conservar los sensores operativos en sus posiciones configuradas. El dibujo puede calcular la posición del producto según su velocidad y su paso. Para contrastar motores, usar el mismo caso, formato, duración y semilla de la ronda representativa. Cada motor ejecuta su propia simulación. Comparar primera salida, tiempos de activación de B y P, cola máxima, paquetes tras paro y producción, con atención a las diferencias de implementación y al momento en que se consumen números aleatorios.

En casos con geometría insuficiente, Lba negativo, ocupación principal igual o superior al 100 % o velocidad de banda menor o igual al consumo equivalente, el diagnóstico debe indicar la condición y los cálculos afectados. Las mediciones reales de un tramo de longitud cero se pueden conservar como cero. Un tramo ausente de longitud cero no aporta tiempo de tránsito ni inventario.

# Rate Loss: efecto en producción y eficiencia

Desde el motor continuo 0.17.7, Resultados y reportes muestran pérdida bruta, recuperación y balance neto de línea en minutos equivalentes, salida equivalente y puntos porcentuales de eficiencia.

Por cada paso con salida final positiva, usando la referencia activa R:

```text
Pérdida de salida equivalente = max(0, R × duración del paso − salida)
Recuperación equivalente = max(0, salida − R × duración del paso)
Balance neto = pérdida − recuperación
Magnitud en pp = 100 × salida equivalente / salida ideal del período simulado
```

En la tabla, el efecto de pérdida se muestra negativo y el de recuperación positivo. El neto conserva su signo. Se usa la salida ideal durante toda la duración simulada, con las referencias de cada formato; no es automáticamente AU ni una medición AEM validada. El tooltip explicita el denominador. Los paros completos quedan fuera de Rate Loss.

Con formatos configurados, la salida se expresa en botellas equivalentes. Sin conversión a botellas, se identifica como salida equivalente en la unidad nativa. Los contadores no son rechazos ni una promesa de producción adicional recuperable. La recuperación puede reflejar descarga de acumuladores.

La conversión se integra por paso: multiplicar los minutos totales por una referencia media sería incorrecto cuando cambia la velocidad estándar entre formatos. Los nuevos campos se guardan en summary y en cada ronda; el promedio usa los valores de todas las rondas y conserva la ausencia de datos. Los puntos se calculan por ronda antes de promediar.

Resultados antiguos: se permite convertir cuando sus datos identifican una referencia constante. Si los formatos tienen referencias distintas y no se guardaron contadores equivalentes, se muestran los minutos disponibles y “—” para volumen/pp, solicitando recalcular. No se reconstruyen pérdidas a partir de muestras de reproducción reducidas.

Ejemplo del Caso C de 704 minutos, referencia constante de 220 botellas/min y salida ideal de 154,880 botellas, promedio de 10 rondas:

| Concepto | Min equivalentes | Botellas equivalentes | Efecto en eficiencia (pp) |
|---|---:|---:|---:|
| Pérdida bruta | 7.003003 | 1,540.660603 | −0.994745 |
| Recuperación | 6.699953 | 1,473.989697 | +0.951698 |
| Pérdida neta | 0.303050 | 66.670905 | −0.043047 |

Estas magnitudes se calculan en la salida final y no se obtienen sumando pérdidas de equipos. Ver [compendio AEM](AEM_CONCEPTS_FORMULAS.md) para distinguir denominadores y [confirmaciones pendientes](PLANT_COMPARISON_CONFIRMATIONS.md) para la comparación con planta.

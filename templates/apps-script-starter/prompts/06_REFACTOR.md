# Extraer componentes reutilizables

Versión: **[versión o commit]**.
Responsabilidad que deseo reorganizar: **[interfaz, servicios, animaciones, validación, etc.]**.
Motivo: **[duplicación, mantenimiento, inconsistencia]**.
Archivos adjuntos: **[lista]**.

Identifica duplicaciones reales y dependencias. Propón límites de módulos según su responsabilidad, con entradas y salidas claras. Evita fragmentar funciones pequeñas sin beneficio o crear abstracciones que todavía no tienen un uso concreto.

Migra a los consumidores y elimina las implementaciones duplicadas. Actualiza el orden de carga, renderizado local, documentación y pruebas afectadas. Conserva el comportamiento observable y los contratos persistidos; describe cualquier cambio inevitable.

Comprueba especialmente cancelación, llamadas simultáneas, manejo de errores y accesibilidad cuando el componente los controle. No prometas una mejora de rendimiento si únicamente reorganizaste archivos.

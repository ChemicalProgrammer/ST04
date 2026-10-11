# Procedencia y adaptación

Fecha de creación de esta plantilla: **11 de octubre de 2026**.

Referencia de extracción: repositorio `ChemicalProgrammer/ST01`, commit `ca9e5c8e84e32eeee266c86a9d28d2e4ff1a25bb`.

| Componente | Tratamiento |
|---|---|
| `Motion.html` | Copia del módulo compartido de la referencia, con namespace cambiado de `STMotion` a `AppMotion` |
| `MotionStyles.html` | Reutilización de las transiciones, duraciones y reglas de movimiento reducido |
| `DesignTokens.html` | Selección y adaptación de convenciones de espaciado, controles, colores y temas |
| Identidad y respuestas | Adaptación de los patrones de `AuthService.gs`, `ApiResponse.gs` y bloqueo por usuario |
| Diálogos y estado cliente | Aplicación de los patrones de confirmación, errores visibles y separación cliente/servidor |
| Servicios de proyectos | Implementación nueva para el contrato genérico de esta plantilla |
| Interfaz de proyectos, pruebas y prompts | Incorporados al crear esta plantilla |

La plantilla se publica como una extracción posterior de componentes reutilizables. Mantén este documento si cambias los módulos de origen o haces una nueva extracción; registra los cambios propios de cada derivación.

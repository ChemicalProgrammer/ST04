# Diagnosticar un error

Versión: **[versión o commit]**.
Pasos para reproducir: **[pasos]**.
Resultado esperado: **[resultado]**.
Resultado observado y mensaje exacto: **[resultado, código o traza]**.
Último cambio conocido: **[cambio]**.
Archivos adjuntos: **[lista]**.

Sigue el flujo desde el evento de interfaz hasta la respuesta del servidor y la actualización de pantalla. Comprueba el orden de carga, nombres de funciones, contratos de respuesta, validación y persistencia. Distingue un fallo del código de una versión desplegada incompleta.

No declares una causa definitiva sin evidencia. Formula hipótesis y busca una reproducción mínima. Solicita únicamente el contexto que permita diferenciarlas. Evita registrar credenciales o contenidos privados.

Corrige la causa reproducida con el menor cambio coherente. Si solo puedes mejorar el diagnóstico, indícalo y explica qué falta para confirmar la causa. Cuando sea relevante, agrega una prueba que falle con el problema y pase con la corrección. Conserva visible el mensaje de error y el trabajo pendiente del usuario.

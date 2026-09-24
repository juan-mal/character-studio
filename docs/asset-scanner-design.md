# Fase 1: catálogo verificable

El encargo autoriza implementar y ejecutar esta fase completa. Se implementa en esta sesión, sin interfaz ni exportador GLB.

## Contrato

Leer recursivamente el proyecto y las tres fuentes configurables, sin escribir en originales. Registrar cada OBJ incluso si es excluido o un LOD secundario. Los archivos generados viven en src/generated y reports. Rutas mediante identificador de fuente y ruta relativa; configuración con ~ portable.

Separar categoría inferida, geometría válida, candidatura de catálogo y compatibilidad. Una categoría es una hipótesis apoyada por nombres y métricas, nunca identificación anatómica garantizada. Unknown, efectos, entorno, props y colliders quedan fuera. Un OBJ no contiene pesos/esqueleto utilizables para animación.

## Análisis

Parser OBJ de índices positivos/negativos, polígonos, grupos, UV, normales, materiales, errores y límites. SHA-256 de conectividad ordenada, índices UV, valores UV y distribución de normales. Exact exige igualdad de conectividad y UV completas; probable preserva topología pero faltan UV; incompatible cuando difieren índices, conteos o UV. Igualdad topológica identifica candidatos técnicos, no demuestra que todos los vértices sean semánticamente homólogos.

Para MergedMeshLod0, extraer arquetipo/cuerpo/cabello, buscar originales existentes de la variante exacta y contrastar posiciones y triángulos cuantizados. Un nombre coincidente solo produce evidencia débil. Geometría contenida respalda la combinación; partes ausentes o discrepantes quedan explícitas.

Para BaseBody, comparar límites y vértices de bordes abiertos soldando posiciones para reducir falsos bordes UV. Registrar distancias de unión y cobertura; no declarar personaje completo. Caras/cuerpos: proximidad de bordes, escala y posición; no emparejar por número.

MTL es evidencia de asignación; coincidencias de nombre/familia/carpeta son candidatas que requieren validación visual. Sprites se registran por separado, con hashes para duplicados. Lightmap/SDF se conservan como other, nunca se inventa una conversión PBR.

## Verificación

Pruebas adversariales con geometrías pequeñas conocidas, MTL, imágenes y archivos inválidos. Comprobar conteos, índices negativos, conectividad distinta con iguales vértices, UV, LOD, relaciones ambiguas y escritura fuera de originales. Ejecutar sobre las fuentes reales, validar referencias de JSON y repetir: salidas deterministas e inventario de hashes sin cambios.

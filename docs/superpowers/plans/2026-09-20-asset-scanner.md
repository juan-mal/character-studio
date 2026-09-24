# Asset Scanner Implementation Plan

**Goal:** entregar el catálogo fiable solicitado de las fuentes reales.
**Architecture:** módulos puros de inspección, inferencia conservadora y un orquestador de lectura/escritura.
**Tech Stack:** Node >=22.18, TypeScript estricto, node:test, sin Blender ni dependencias de producción.
**Spec:** docs/asset-scanner-design.md

## Restricciones

Sin interfaz final. Windows. Originales de solo lectura. Sin rutas absolutas codificadas. Todos los resultados deben expresar evidencia y límites.

## Ejecución en esta sesión

- [x] Parser y schema: src/assets/types.ts, tools/assets/obj.ts; tests/geometry.test.ts. Contar índices y detectar corrupción antes de inferir.
- [x] Descubrimiento, imágenes, materiales y clasificación: tools/assets/{files,images,materials,classify}.ts; tests/catalog.test.ts. Cubrir rutas con espacios, duplicados y nombres ambiguos.
- [x] Relaciones: tools/assets/{catalog,compatibility}.ts; pruebas de morph, MergedMesh y BaseBody con evidencia geométrica.
- [x] Orquestación e informe: tools/assets/{scan,report,validate}.ts; tests/integration.test.ts. Validar referencias y reproducibilidad.
- [x] Ejecutar pnpm check y pnpm assets:scan; inspeccionar JSON, corregir problemas y repetir. Documentar resultados y comandos en README.md.

## Puntos de revisión

Índices fuera de rango; UV ausentes o incompatibles; colisiones de familia/arquetipo; LOD0 ausente; entrada ilegible o imagen corrupta. Cada condición debe producir estado explícito y nunca compatibilidad exacta inventada.

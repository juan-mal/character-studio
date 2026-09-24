# Character Studio

## Alcance autorizado

Aplicación local React/TypeScript/Vite/Three.js sobre los catálogos de fase 1. La petición especifica diseño, comportamiento y verificación, por lo que se ejecuta completa en esta sesión. Sin servicios remotos, HDR externo ni framework de estado/3D adicional.

## Decisiones

UI de tres columnas: navegación discreta, escenario amplio y panel de 360 px. Paleta neutra solicitada, tipografía system/Inter local, bordes y radio 10px. Header de 64px. Tablet compacta y móvil con panel inferior. Las categorías se calculan desde opciones compatibles, no desde una lista de modelos.

El catálogo actual solo tiene tres presets geométricamente respaldados del mismo cuerpo Girl Body002. No inventar otros cuerpos/caras/tintado. Un inspector revisa si geometría adicional y texturas permiten ampliar evidencia. Las relaciones sin confirmar permanecen fuera de controles incompatibles. Material sin textura confirmada se presenta neutro y su limitación debe ser visible.

## Módulos y contratos

- `src/types/studio.ts`: StudioData y configuración versionada mínima, serializable mediante IDs.
- `src/compatibility`, `src/state`, `src/character`: resolver conservador, fallback y validación; historial sin cámara; persistencia pequeña y optativa recuperación.
- `src/three`, `src/materials`, `src/export`: cachés, OBJ/MTL y GLB; un renderer persistente; ensamblaje transaccional, materiales por instancia; exportar CharacterRoot clonado con SkeletonUtils.
- `src/components`, `src/app`, `src/styles`: UI accesible y notificaciones. Una selección solo se confirma después de cargar correctamente para evitar estados rotos. Durante una carga se conserva el personaje anterior.
- Plugin Vite local: catálogo e imágenes/modelos mediante allowlist basada en archivos generados. Build copia recursos en dist sin tocar los originales. Sin rutas absolutas en cliente.

## Verificación

Pruebas unitarias de compatibilidad, estado, undo/redo, validación, fallback y serialización. Typecheck, lint, tests, build. Navegador real con inspección visual de carga, opciones disponibles, cámara, acciones y descargas; volver a importar GLB para comprobar geometría y texturas embebidas. Funciones no habilitadas por datos reales se prueban con fixtures de contrato y se documentan como ausentes en catálogo actual.

# Character Studio

Editor local de personajes con React, TypeScript, Vite y Three.js. Incluye scanner, catálogo respaldado por geometría, editor con historial, presets JSON y exportación GLB binaria con texturas embebidas.

La exportación conserva el RGB de mapas opacos incluso cuando el PNG original contiene alfa transparente; prepara una copia aislada sin alterar los materiales visibles. Las auditorías, capturas y reportes de cada máquina se generan localmente en `reports/` y no se publican.

```sh

pnpm install

pnpm dev

```

Abre http://127.0.0.1:5173. Arrastra con el botón izquierdo para mover la vista, con el derecho para rotar y usa la rueda para zoom. La cámara queda fuera del historial. `Ctrl/Cmd Z` deshace; `Ctrl/Cmd Shift Z` rehace. Guardar descarga `MyCharacter.json`; cargar lo valida y recupera referencias obsoletas con alternativas compatibles. Al regresar se ofrece recuperar la última configuración local. No se guardan modelos en localStorage.

`pnpm build` crea `dist` con copias independientes de los recursos. `pnpm preview` permite revisar esa compilación en http://127.0.0.1:4173. No requiere CDN, HDR, API, fuentes remotas ni conexión durante el uso. Los recursos originales nunca se editan.

## Contenido realmente habilitado

Hay **19 presets y 17 cuerpos/atuendos**: tres combinaciones del NPC inicial, Amber, Barbara, Bennett, Diluc, Jean, Kaeya, Lisa, Noelle, Sucrose, Xiangling, Fischl, Keqing, Mona y Razor, además de Amber con atuendo alternativo y Barbara con atuendo de verano. Los paquetes mantienen sus atlas originales; los intercambios de cabezas requieren revisión geométrica y visual. Los atuendos se eligen en Presets o Cuerpo; no son prendas independientes.

Consulta [importar paquetes locales](docs/importar-paquetes.md). Se reutilizan los FBX locales, sin descargas ni modificación de originales. El cargador elimina declaraciones OBJ redundantes que causaban miles de grupos de dibujo y comparte texturas idénticas por hash.

### Acabado anime

Las piezas revisadas utilizan `metadata.shading: "anime-static"`, registrado mediante `assets.reviewed.json` o el manifiesto de ensamblaje FBX revisado. El perfil conserva los mapas de color originales, añade iluminación pintada en colores de vértice y emplea material unlit. El rostro recibe sombras más suaves que cuerpo/cabello; se evita el contraste fotográfico ACES y los reflejos PBR que oscurecían la cara. El suelo conserva su sombra independiente.

El acabado viaja en GLB mediante `COLOR_0` y `KHR_materials_unlit`, sin necesitar shaders privados del editor. La luz del personaje queda fija en su espacio local: es una aproximación anime portátil para estos OBJ estáticos, no el shader dinámico del juego. No reconstruye SDF facial, lightmaps empaquetados, rim dependiente de cámara ni animaciones. Los mapas no revisados no se reinterpretan como roughness/metallic. La aplicación rechaza combinar este perfil estático con skin/morph o mapas PBR/emisivos sin una adaptación explícita.

Los nuevos assets conservan su material habitual hasta recibir revisión; el nombre no activa el perfil anime. Para GLB con materiales embebidos, conserva esos materiales y no asignes este perfil de preparación OBJ.

Los tres presets del NPC Girl Standard usan Body002 con Hair205, Hair210 o Hair213. Comparten un cuerpo y una cabeza recuperada del residual idéntico de tres MergedMesh originales, conservando coordenadas, UV y normales. Hay cinco asociaciones de textura revisadas: cuerpo, cabeza, dos diseños de Hair210 (blanco/rubio) y Hair213. Hair205 se muestra con material neutro porque su textura candidata no quedó validada. El inicio elige el preset con más piezas texturizadas de forma confirmada.

Ojos, ropa y calzado están integrados en este cuerpo. Las categorías independientes sin compatibilidad confirmada se ocultan. No hay morphs preparados ni tintado arbitrario habilitado. Las miniaturas ausentes usan placeholder; nunca se carga una malla para simular un sprite. El catálogo completo conserva las piezas pendientes de revisión para futuras incorporaciones.

## Arquitectura y extensión

Guía práctica: [agregar modelos, ropa, texturas y miniaturas](docs/agregar-contenido.md).

### Incorporar contenido sin cambiar la interfaz

Las fuentes se configuran en `assets.scan.json`: `mesh` para OBJ/MTL, `texture` para mapas y `preview` para miniaturas (o `mixed` para una carpeta combinada). Los archivos conservan su ruta, hash e ID en el catálogo. Añade originales a esas carpetas; ejecuta `pnpm assets:scan` y `pnpm assets:validate --sources`; revisa `reports/asset-inspection.md`. Para distribución, vuelve a ejecutar `pnpm build`.

**Cabello:** incorpora el OBJ de máxima calidad y sus mapas. Comprueba UV y normales, posición de la raíz, escala y ajuste a la cabeza desde frente, lados y espalda. Incluye el MergedMesh de referencia si existe: el scanner contrasta superficies de cuerpo/cabello, no solo nombres. Un candidato sin esa compatibilidad confirmada queda registrado pero oculto.

**Cuerpo:** incorpora OBJ/MTL y variantes reales Standard/Fat/Strong por separado. Aporta evidencia de ensamblaje MergedMesh con cabello. El nuevo preset solo se ofrece si sus piezas individuales existen y sus superficies coinciden. El encuadre usa bounds, no factores de escala específicos. Igual número de vértices no habilita morphs.

**Cara:** incorpora la malla y su textura, y comprueba cuello, ojos, orejas, UV y coordenadas en el conjunto. Face001 nunca implica Body001. La inspección espacial automática solo genera candidatos; la cabeza actual se confirma mediante residual original idéntico en tres merged. Una cara nueva sin evidencia de superficie necesita ampliar el análisis/revisión de compatibilidad del scanner antes de habilitarla; no basta cambiar una bandera o el nombre.

**Textura de ropa:** si el MTL enlaza directamente el mapa correcto, el scanner registra esa asignación. Si no hay MTL, agrega una entrada a `textureRules` de `assets.reviewed.json` con `mesh.name`, `mesh.sha256`, `image.name`, `image.sha256`, `role`, `variantName` y evidencia de revisión UV. Varias reglas para la misma malla producen varios diseños. Cambian mapas, conservando geometría y UV. No uses Lightmap/SDF como albedo, roughness o normal. La ropa actual está integrada en Body002; no constituye torso/pantalón intercambiable.

**Preview:** añade la imagen a una fuente `preview`. Se utilizan previews confirmados o candidatos coincidentes con el arquetipo; las imágenes se presentan con `object-fit: contain`. Para confirmar una asociación reproducible, usa `assetRules` con `preview: { "name": "nombre_sin_extensión", "sha256": "hash_real" }`, además de la malla y la evidencia. El hash debe proceder del inventario generado. No uses el atlas de color como preview del modelo. La ausencia de miniatura muestra un placeholder.

**Tintable y caras de material:** `assetRules` admite `tintable: true/false` y `renderSide: "front"/"double"`. Las reglas requieren la malla exacta y evidencia; dejan de aplicarse si cambia su hash. Ejemplo estructural (sustituye todos los campos de ejemplo por valores comprobados):

```json

{

  "id": "revision-de-un-asset",

  "mesh": { "name": "NombreReal", "sha256": "HASH_SHA256_DEL_INVENTARIO" },

  "tintable": true,

  "renderSide": "front",

  "review": {

    "method": "Revisión del mapa base y prueba de multiplicación de color",

    "evidence": ["El color no altera piel ni accesorios integrados; UV y exportación comprobadas."]

  }

}

```

Inserta esa entrada en `assetRules`, manteniendo las demás revisiones. `tintable` solo se debe activar si la textura está preparada para multiplicar color: no elimina el mapa, y un atlas compartido puede teñir zonas no deseadas. Ningún asset actual tiene tintado confirmado. Los cambios de diseño blanco/rubio usan imágenes reales. Las cinco mallas del ensamblaje actual conservan DoubleSide por superficies abiertas visibles en la revisión frontal, posterior y oblicua; las mallas nuevas usan FrontSide por defecto. La transparencia únicamente se activa al aplicar un mapa de opacidad, máscara o material original que la requiera.

**Compatibilidad:** se define en el scanner con evidencia de superficies, topología, UV y relaciones entre piezas. `compatibility.generated.json` almacena esas relaciones; la aplicación exige `supported` y `confirmed`, y las incompatibilidades prevalecen. Las relaciones por nombre o solo bounding box permanecen candidatas. Para incorporar una regla de evidencia nueva, amplía el scanner y sus pruebas; no edites el JSON generado ni fuerces escalas en el componente React. Actualmente no hay un editor manual de compatibilidad ni un sistema general de calibraciones importables: ninguna pieza de esta entrega requiere transformaciones correctivas.

### Exportación, cámara y límites

`Exportar GLB` descarga exclusivamente CharacterRoot. Guarda geometría, materiales, texturas embebidas y skins/morphs que ya existan. El GLB se ha reimportado con GLTFLoader y comparado visualmente con el ensamblaje original. OBJ no aporta huesos, pesos ni animaciones; esta colección produce personajes estáticos. La exportación no crea rigs ni clips nuevos.

La cámara conserva su orientación al cambiar piezas. Al cambiar arquetipo o cuando el conjunto queda fuera de vista se reencuadra el cuerpo completo. **Centrar cámara** restablece la vista frontal del personaje y conserva la distancia de zoom y la zona actual que estabas inspeccionando. **Cuerpo completo** es el control que reencuadra todo el modelo. El lienzo admite teclado: flechas para girar, `Mayús + flechas` para desplazar, `+`/`-` para zoom e `Inicio` para cuerpo completo. En táctil: un dedo gira y dos dedos giran/acercan. La navegación manual conserva su encuadre al redimensionar la ventana. El encuadre y los helpers no afectan undo/redo.

La auditoría reproducible está en `tests/e2e/audit.spec.ts`: cinco resoluciones, accesibilidad automatizada, GLB descargado y reimportado, JSON reconstruido, caché y estabilidad de recursos durante doce vueltas completas por los presets habilitados. Los resultados se guardan en `reports/audit`. Las cifras de memoria son observaciones de Chromium en esa prueba, no una garantía sobre cualquier dispositivo o catálogo futuro.

- `src/compatibility`: opciones, validación y sustitución de piezas por evidencia del catálogo.

- `src/state`, `src/character`, `src/hooks`: configuración, historial, persistencia y coordinación transaccional con la escena.

- `src/three`: escena persistente, cachés de geometrías/texturas, OBJ/MTL/GLB, carga diferida y liberación de recursos.

- `src/materials`, `src/export`: mapas por rol, materiales por instancia, clon seguro y exportación GLB. Las máscaras compatibles se hornean en el alfa de una textura independiente para conservar transparencia.

- `src/app`, `src/components`, `src/styles`: interfaz, categorías derivadas y responsive.

- `tools/studio`: servidor local con inventario de recursos permitidos y empaquetado de originales en `dist`.

Añade archivos a las fuentes y ejecuta `pnpm assets:scan`. La aplicación vuelve a leer los tres JSON generados; el servidor de desarrollo detecta su regeneración. Una pieza nueva solo aparece si tiene evidencia compatible, no por coincidir el nombre. `assets.reviewed.json` registra revisiones UV y reglas de derivados con hashes: si cambian los archivos, se retira la confirmación y se informa el motivo. No edites directamente los JSON generados.

AssetManager admite OBJ y GLB; al sustituir mallas por GLB, conserva IDs, referencias y metadatos validados en el catálogo. Los morphs solo se aceptan con `metadata.preparedMorphTargets` y una malla GLB/GLTF preparada; ningún OBJ incompatible se convierte en morph en runtime. La exportación conserva skins y morphs existentes, aunque los OBJ actuales no los contienen. El scanner inicial inspecciona OBJ; los GLB futuros requieren una etapa de inspección equivalente para incorporarse como mallas principales.

`?debug=1` habilita información de piezas, dimensiones, bounds, ejes y wireframe. Helpers, iluminación y cámara nunca forman parte del GLB.

## Verificación de la aplicación

```sh

pnpm typecheck

pnpm lint

pnpm test

pnpm build

pnpm exec playwright install chromium

pnpm test:e2e

```

Las pruebas de navegador usan assets reales y comprueban edición, diseños, cámara, historial, importación/recuperación, responsive y contenido del GLB descargado. Los fixtures sintéticos de materiales se limitan a pruebas y no entran al catálogo. Los resultados visuales y el GLB verificado están en `reports/inspection`.

## Ejecutar

Requisitos: Node.js 22.18 o posterior y pnpm. Compatible con Windows.

```sh

pnpm install

pnpm assets:scan

pnpm assets:validate --sources

pnpm check

```

`assets.scan.json` configura el proyecto y `~/Downloads/Mesh`, `~/Downloads/Texture2D`, `~/Downloads/Sprite`. `~` se resuelve desde el usuario actual; no hay rutas de ordenador codificadas. Las rutas relativas se resuelven desde la raíz del proyecto donde ejecutas el comando.

Para otras ubicaciones, crea un archivo de configuración local con la misma estructura:

```sh

pnpm assets:scan --config assets.scan.local.json

```

Una fuente ausente o ilegible hace fallar el comando sin sobrescribir el catálogo anterior. Los enlaces simbólicos de entrada se omiten; las carpetas de salida no pueden ser enlaces. No se siguen referencias de MTL fuera del inventario configurado. Se excluyen dependencias, `.git` y salidas generadas de la exploración.

También se excluyen `test-results` y `playwright-report` en la raíz: capturas y recursos temporales de las pruebas no son assets originales.

## Entregables

- `src/generated/assets.generated.json`: assets lógicos, referencia a malla primaria, todos los LOD con sus rutas, materiales, variantes de textura e imágenes.

- `src/generated/compatibility.generated.json`: pares morph, relaciones entre piezas, evidencia MergedMesh y análisis de BaseBody.

- `src/generated/presets.generated.json`: combinaciones observadas, piezas encontradas y ausentes.

- `reports/asset-inspection.json`: inventario completo por OBJ, métricas, problemas y hashes SHA-256 de originales.

- `reports/asset-inspection.md`: resultados legibles y recomendaciones.

- `src/assets/types.ts`: contrato TypeScript estricto.

Los archivos generados contienen `sourceId` + `relativePath`. Para abrir un archivo, busca su fuente en `sources`, expande `~` y combina con `relativePath`. `path` es un identificador legible `fuente/ruta`, no una URL pública. El plugin de Vite sirve el inventario por ID y copia los recursos al compilar.

## Evidencia y límites

- `metadata.mainApplication` habilita candidatos con geometría válida, UV, máxima calidad y sin conflictos LOD. **No significa personaje completo, animable ni texturizado confirmado.** Las categorías anatómicas son inferencias, no reconocimiento semántico demostrado.

- `mesh.lod: null` significa nombre sin LOD explícito, tratado como máxima calidad candidata. LOD0 tiene prioridad sobre LOD reducidos; en el mismo nivel se usa la malla válida con más caras. `_High` y archivos sin sufijo se conservan. La agrupación nominal requiere límites espaciales compatibles; contradicciones quedan separadas para revisión.

- Morph `exact` exige mismos conteos de vértices/caras, índices ordenados de caras, UV completas idénticas e igual distribución de índices de normales. No basta igual número de vértices. `probable` conserva topología sin evidencia UV/layout suficiente. `incompatible` impide morph directo sin reconstrucción/correspondencia adicional. No se intenta reindexar por isomorfismo.

- MergedMesh: `confirmed` exige, en el mismo merged, al menos 98% de posiciones únicas y 95% de triángulos coincidentes para ambas piezas. Se cuantizan coordenadas a 0.0001 unidades y se ignora winding para buscar superficies; no se aplica alineación automática. Los nombres de arquetipo se conservan como candidatos.

- BaseBody: bordes soldados por posición a 0.000001 unidades, hasta 128 muestras por pieza. Proximidad con tolerancia de 0.5% de la dimensión máxima. No certifica costura completa, normales, rig ni cobertura anatómica.

- Caras/cuerpos: hipótesis de eje vertical Y, posiciones, escalas y límites. `incompatible` aquí significa montaje directo no respaldado en las coordenadas originales; podría requerir una transformación no disponible. Nunca se empareja Face001 y Body001 solo por número.

- MTL: una cadena de rutas OBJ→MTL→imagen resuelta directamente produce asignación confirmada. También se admiten revisiones UV explícitas con hashes en `assets.reviewed.json`. Recuperación por nombre único queda `probable`. Familia, nombre y carpeta producen `candidate`; las variantes candidatas no se aplican automáticamente. Los parámetros MTL se aproximan a materiales PBR, conservando color, emisión y opacidad; el shader original no se reconstruye.

- Previews: solo miniaturas. `previewCandidates` conserva asociaciones por nombre, incluso para archivos de contenido duplicado. `preview` queda vacío hasta validación explícita.

- PNG/JPEG/WebP/TGA: inspección de cabeceras y dimensiones, no validación completa de píxeles/shaders. Otros formatos relacionados se inventarían sin convertirlos. Lightmap/SDF quedan en `other`, y tintado de ojos/cabello en `unknown`.

- OBJ no conserva esqueleto ni pesos. La ausencia de normales/UV referenciadas correctamente queda registrada; el scanner no repara ni elimina archivos.

## Seguridad y reproducibilidad

El scanner solo escribe en `src/generated`, `reports` y un bloqueo temporal en la raíz. Cada salida se escribe a un archivo temporal y luego se sustituye mediante rename; no hay transacción global de los cinco archivos, por lo que una interrupción durante publicación requiere repetir el comando. El bloqueo evita dos escaneos simultáneos; si queda `.assets-scan.lock` después de una interrupción, verifica que no haya otro scanner activo antes de retirarlo.

Las salidas son deterministas para el mismo inventario y configuración. `pnpm assets:validate` comprueba referencias cruzadas, conteos, LOD y huellas. `--sources` vuelve a leer todos los originales y compara su contenido con los hashes registrados. `pnpm check` comprueba tipos y ejecuta pruebas de parser, exclusiones, relaciones, MTL, corrupción, invariancia de originales y regeneración.

La estructura de implementación está descrita en `docs/asset-scanner-design.md`.


## Personalización de los paquetes importados

En Cabello, Cara, Ojos y Cejas se muestran únicamente piezas con relaciones compatibles. La revisión está en `content/head-mixes.reviewed.json`: incluye hashes de las piezas y comprueba la superficie de unión del cuello cada vez que se escanea. No relaciona personajes por números de archivo ni modifica su escala. Los cabellos de Noelle y Xiangling incluyen elementos del traje y están restringidos a su conjunto original. Fischl conserva su conjunto por el ojo ausente bajo el parche; Sucrose, por las gafas integradas en las piezas faciales. Los adornos integrados en el cuerpo siguen perteneciendo al atuendo.

Cada pieza preparada ofrece una paleta y un selector de color personalizado. Los cambios se aplican automáticamente tras una pausa breve del selector; **Original** elimina el ajuste. Cuando el navegador admite EyeDropper aparece **Tomar color**, activado únicamente al pulsarlo. Los cambios se guardan en JSON como parámetros pequeños y se hornean en copias de las texturas al exportar GLB. No modifican los PNG originales ni los materiales compartidos. `tintable` sigue controlando el tintado del material; el editor de textura es un proceso separado para atlas PNG preparados. Los presets antiguos con ajustes de matiz/saturación siguen siendo legibles.

El control de piel solo aparece en cuerpos con regiones del atlas revisadas: Amber original/alternativa y Barbara original/verano. Afecta al rostro y las regiones declaradas en `assembly.json > skin`. No se infiere una máscara de piel para otros trajes. El recolor de una pieza completa puede cambiar sus adornos pintados en el mismo atlas.

El importador separa los iris como componentes geométricos frontales pequeños dentro del contorno ocular. En estos FBX, `Face_Eye` es piel facial y se conserva con la cara; no se utiliza como iris. Esta extracción necesita revisión visual antes de habilitar cada nuevo paquete.

El desplazamiento con botón izquierdo cambia el encuadre sin mover el punto de giro y permite recorrer varias alturas de pantalla al acercarse a cara o piernas. El botón derecho rota alrededor del personaje. **Centrar cámara** vuelve a la vista frontal, conserva zoom y mantiene la zona actual que estabas revisando. **Cuerpo completo** o **Cara** establecen un nuevo encuadre. Ninguna de estas acciones transforma el modelo ni entra en undo/redo.

Los paquetes revisados siguen disponibles cuando el disco del FBX de origen está desconectado: el scanner verifica todos los archivos locales mediante SHA-256 y registra el origen ausente como advertencia. Si el origen está disponible y cambió, o cambió cualquier recurso local revisado, se revoca su revisión.

### Extracción modular con AnimeStudio

AnimeStudio extrae archivos de una instalación local del juego; no descarga personajes de un servicio. `tools/content/Extract-Modular.ps1` ejecuta lotes de hasta diez bloques concretos mediante CLI, conserva los originales y escribe logs separados. Requiere un runtime con el mapa CAB correspondiente y soporte funcional de `--map_op 3`. No debe apuntarse la salida a los bloques originales. La extracción no habilita automáticamente assets en el catálogo.

Para inspeccionar un lote exportado sin recorrer todo el disco:

```powershell
node tools/content/inspect-fbx.ts ruta/al/lote/GameObject reports/modular-candidates.json 24
```

El informe registra hashes, geometría, materiales, expresiones y fallos de FBX. No certifica los píxeles ni las uniones. Los candidatos modulares extraídos permanecen fuera del catálogo hasta revisar materiales, complementos de piel, pose y cobertura entre prendas. Consulta `reports/modular-progress.md` para el estado real del lote actual.

Los paquetes OBJ preparados siguen siendo estáticos: no contienen el rig ni las animaciones del FBX. Los atuendos integrados no son prendas separadas. La compatibilidad revisada es para la pose estática, no una garantía de ausencia de colisiones al animar.

# Cómo ampliar Character Studio

## Mover la vista

Arrastra con el botón izquierdo para desplazar el personaje en la pantalla, también hacia arriba o abajo. Arrastra con el derecho para rotar y usa la rueda para acercarte. Para revisar las piernas, acerca la vista y arrastra el personaje hacia arriba. «Centrar cámara» vuelve a la vista frontal y conserva tanto el zoom como la zona que estabas revisando. Usa «Cuerpo completo» si quieres recuperar el encuadre completo.

En teclado: flechas rotan, Mayús + flechas desplazan, +/− acercan/alejan e Inicio muestra el cuerpo completo. En táctil: un dedo rota; dos dedos permiten rotación y zoom. Solo se mueve la cámara: las coordenadas del personaje, el historial y la exportación no cambian. El desplazamiento no tiene un límite artificial, por lo que puedes recorrer cara y piernas con cualquier zoom.

## Dos tipos de contenido diferentes

| Lo que quieres cambiar | Qué necesitas |
| --- | --- |
| Color o dibujo de una chaqueta existente | Una textura alternativa con el mismo layout UV del cuerpo o chaqueta. |
| Forma de la chaqueta, falda o pantalón | Otra malla 3D compatible, no solo una imagen. |
| Peinado | Malla de cabello, atlas correcto y ajuste a la cabeza. |
| Color de pelo | Diseño alternativo compatible o una textura preparada para tintado. |
| Rostro | Malla y textura compatibles con cuello, ojos y cabeza del conjunto. |
| Ojos | Pieza independiente si existe; si están pintados en el rostro, una variante del atlas facial. |
| Miniatura de selección | Imagen PNG/WebP del asset; nunca sustituye al modelo. |
| Nuevo personaje completo | Conjunto de cuerpo/cabeza/cabello y mapas con compatibilidad demostrada. |

El cuerpo Girl actual incluye ropa, ojos y calzado. No se pueden intercambiar esas superficies como piezas independientes sin preparar otro cuerpo o separar correctamente la geometría. Una textura descargada para otro personaje normalmente utiliza UV diferentes.

## Incorporar archivos con el scanner actual

1. Conserva una copia del paquete original. Pon OBJ/MTL en `Downloads/Mesh`, texturas en `Downloads/Texture2D` y miniaturas en `Downloads/Sprite`. Puedes usar subcarpetas. Las rutas actuales están en `assets.scan.json`; también puedes añadir allí otra fuente local.
2. Para piezas preparadas en una herramienta 3D, conserva la escala y coordenadas del conjunto, UV y normales. Comprueba el ajuste ensamblado; no pongas todas las piezas en el origen por separado. El scanner actual inspecciona OBJ; aunque el cargador admite GLB, añadir un GLB a la carpeta todavía no basta para catalogarlo como pieza principal.
3. En la carpeta del proyecto ejecuta:

   ```powershell
   pnpm assets:scan
   pnpm assets:validate --sources
   pnpm dev
   ```

4. Revisa `reports/asset-inspection.md`: el archivo puede estar inventariado y seguir pendiente de compatibilidad. La existencia de una miniatura o un nombre parecido no lo habilita.
5. Registra las asociaciones revisadas en `assets.reviewed.json`, conservando las reglas anteriores. `textureRules` relaciona malla e imagen por nombre y hash; varias imágenes compatibles se convierten en diseños. `assetRules` permite asociar preview, tintable, renderSide y el acabado anime estático. Los hashes reales se encuentran en el inventario generado. Consulta los ejemplos completos del README.
6. Regenera y valida de nuevo. Si distribuyes la aplicación compilada, ejecuta `pnpm build` para incluir las nuevas copias de recursos.

No edites `assets.generated.json`, `compatibility.generated.json` ni `presets.generated.json` a mano: son salidas del scanner.

## Qué falta para ampliar mucho la selección

Hay 798 OBJ en el inventario inicial y 36 OBJ preparados desde FBX; ahora hay 15 presets confirmados y 13 cuerpos/atuendos. Consulta `importar-paquetes.md` para ampliar la colección de personajes. El catálogo también registra Female/Body016/Hair202 y Girl/Body001 con varios cabellos como candidatos, no como conjuntos validados. Otras combinaciones carecen de piezas individuales.

El siguiente trabajo de contenido debe revisar esas familias contra sus merged, resolver cabeza/UV/texturas, registrar evidencia y probar frente/perfil/espalda y exportación. No basta con activar todos los assets. Cuando no existe evidencia automatizable, se necesita ampliar el scanner con una regla verificable; aún no hay un editor visual de calibración o importación/aprobación manual.

Un flujo visual de importación sería una ampliación separada: elegir archivos, inspeccionar la pieza sobre una base, relacionar materiales/previews, guardar compatibilidad y publicar el catálogo validado. No está implementado por añadir navegación a la cámara.

# Importar paquetes locales sin recorrer el disco completo

Se incorporaron doce paquetes desde la colección organizada en `F:/GI-Assets-main/GI-Assets-main/Models/Characters`: Amber, Barbara, Bennett, Diluc, Jean, Kaeya, Lisa, Noelle, Sucrose y Xiangling, más Amber Alternate y Barbara Summer. Cada paquete conserva cuerpo, cabello y rostro en la misma pose de reposo. Sus atlas de color, materiales MTL y miniaturas están en `content/characters` y `content/previews`. Ocupan aproximadamente 175 MiB, más la copia de distribución en dist.

## Preparación reanudable

Desde la raíz del proyecto:

```powershell
./tools/content/Import-CharacterPacks.ps1 -Source 'F:/GI-Assets-main/GI-Assets-main/Models/Characters' -Characters Amber,Barbara -Limit 2
```

Para un atuendo existente, usa `-Variant Summer -Characters Barbara -Limit 1` o `-Variant Alternate -Characters Amber -Limit 1` con la misma fuente. El nombre del atuendo debe coincidir con su carpeta; no se sustituye por Default si falta. Los materiales se buscan en la carpeta del atuendo y en su carpeta padre, y las referencias ambiguas se rechazan.

El wrapper encuentra Blender instalado, usa dos hilos, registra un log en reports y propaga los errores del proceso. No instala ni descarga herramientas. Lee únicamente las carpetas indicadas, con máximo diez personajes por ejecución. La conversión omite paquetes cuyo FBX y resultados conservan sus hashes. Se probó una segunda ejecución: ambos quedaron UNCHANGED.

`-Output` permite preparar un lote en otro disco. Para incorporarlo al scanner actual, los paquetes revisados deben estar en `content/characters`; el detector de ensamblajes aún no incorpora paquetes externos directamente. No se deben apuntar salidas a los directorios originales.

Un personaje nuevo no está garantizado: materiales desconocidos, mapas ausentes o ambiguos detienen la preparación con un error claro. No se inventan texturas ni se habilitan todas las mallas. No usar -Characters para barrer todas las carpetas sin revisar lotes pequeños.

## Revisión y catálogo

1. El script escribe OBJ estáticos, MTL con mapas directos, copias de Diffuse y assembly.json inicialmente con reviewed=false.
2. Ejecuta `pnpm assets:scan`: las piezas se inventarían pero el conjunto todavía no se habilita como preset.
3. Comprueba cuerpo, rostro, cabello, límites de materiales, frente, perfil y espalda. Comprueba dimensiones y exportación. `pnpm exec playwright test tests/e2e/expansion.spec.ts -g "prepared packs"` genera capturas de todos los paquetes en reports/expansion. `node tools/content/contact-sheets.mjs` organiza las capturas para revisión visual; no habilita modelos automáticamente.
4. Registra evidencia y marca reviewed=true únicamente tras esa revisión. Las miniaturas se relacionan en previews mediante nombre/hash; se colocan en content/previews.
5. Ejecuta `pnpm assets:scan`, `pnpm assets:validate --sources` y `pnpm build` si distribuyes la aplicación.

El scanner verifica el SHA-256 del FBX fuente y de cada OBJ, MTL e imagen preparada. Si falta el disco fuente o cambia alguno de esos archivos, el paquete se retira del catálogo habilitado al regenerar y se registra un aviso. La aplicación ya compilada funciona con sus copias locales y no necesita F: durante el uso.

Las relaciones solo vinculan piezas del mismo ensamblaje revisado. No se autoriza mezclar una cabeza o cabello de otro personaje por compartir tamaño/nombre. El preset muestra el nombre real y las miniaturas usan geometría renderizada, nunca un atlas como retrato.

## Conversión y límites

Estos FBX se importan con global_scale=100 y se convierten de Z-up de Blender a Y-up del editor. Es una transformación común para todas las piezas, registrada en assembly.json y metadata.calibration. No se reajustan las partes individualmente. Los tamaños resultantes se revisaron junto al personaje existente.

Se separan las superficies por sus materiales de cuerpo/cabello/rostro; las del rostro conservan cejas y ojos. Barbara usa Body y Dress sobre el mismo atlas; la asociación se contrastó mediante la referencia _MainTex del material y se revisó sobre las UV. EffectMesh y EyeStar se excluyen por ser overlays de efectos/expresión. Los originales conservan esas mallas.

La preparación es estática: no transfiere el rig, animaciones ni expresiones del FBX a estos OBJ. Ropa y calzado permanecen integrados en el cuerpo; no son prendas intercambiables independientes. No se reinterpretan Lightmap, SDF ni mapas especiales como texturas PBR.

AnimeStudio se intentó ejecutar, pero su instalación carece de bin/AnimeStudio.CLI.dll. La carpeta Map no fue necesaria para este lote. Aprovechar los FBX ya extraídos evitó reparar herramientas, descargar modelos y recorrer los aproximadamente 100.000 recursos del disco mecánico.

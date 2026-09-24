# Phase 1: Verifiable asset catalog

The first phase builds and runs a complete inspection workflow without creating an editor or a GLB exporter.

## Contract

The scanner recursively reads the repository and all three configurable sources without writing to original files. Every OBJ is registered, including excluded objects and secondary LODs. Generated files live in `src/generated` and `reports`. Paths use a portable source identifier and a relative path; `~` is supported in configuration.

It keeps inferred category, valid geometry, catalog eligibility, and compatibility as separate facts. A category is a hypothesis based on names and measurements, never guaranteed anatomical recognition. Unknown objects, effects, environments, props, and colliders stay out of the selectable catalog. OBJ does not contain usable skeleton weights for animation.

## Analysis

The OBJ parser supports positive and negative indices, polygons, groups, UVs, normals, materials, errors, and bounds. It computes SHA-256 fingerprints for ordered connectivity, UV indices and values, and normal-index distribution. `exact` requires equal connectivity and complete UVs; `probable` preserves topology with incomplete UV evidence; `incompatible` is recorded when indices, counts, or UVs differ. Topological equality identifies technical candidates only; it does not prove semantic correspondence between vertices.

For `MergedMeshLod0`, the scanner extracts archetype/body/hair candidates, finds exact individual variants when they exist, and compares quantized positions and triangles. A matching name alone is weak evidence. Contained geometry supports a combination; absent or mismatched parts remain explicit.

For BaseBody pieces, the scanner compares bounds and open-boundary vertices by welding positions to reduce UV-seam false positives. It records joint distances and coverage without declaring a complete character. Faces and bodies are assessed through border proximity, scale, and position; they are never paired by matching numbers.

MTL is evidence for a material assignment. Name, family, and folder matches are candidates that require visual validation. Sprites are registered independently, with hashes to identify duplicates. Lightmap and SDF files remain `other`; the scanner never invents a PBR conversion.

## Verification

Adversarial tests use known small geometries, MTL files, images, and invalid files. They cover counts, negative indices, different connectivity with equal vertex counts, UVs, LODs, ambiguous relations, and writes outside original sources. The scanner runs against real sources, validates generated JSON references, and repeats deterministically while preserving original hashes.

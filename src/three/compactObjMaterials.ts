/** OBJLoader creates a draw group for every usemtl, even when unchanged.
 * Remove redundant declarations only; retain face order, UVs, normals and boundaries. */
export function compactObjMaterials(source: string): string {
  let active: string | undefined;
  return source.split(/\r?\n/).filter(line => {
    if (/^\s*(?:o|g|s)\s/.test(line)) active = undefined;
    const match = /^\s*usemtl\s+(.*)$/.exec(line);
    if (!match) return true;
    const material = match[1]!.trim();
    if (material === active) return false;
    active = material;
    return true;
  }).join('\n');
}

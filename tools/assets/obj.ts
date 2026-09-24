import { createHash } from 'node:crypto';
import type { Bounds, GeometryStats, Issue, MorphPair, Vec3 } from '../../src/assets/types.ts';

export const digest = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
export const tokens = (value: string): string[] => [...value.matchAll(/"([^"]*)"|'([^']*)'|([^\s]+)/g)].map(m => m[1] ?? m[2] ?? m[3] ?? '');
export const pointKey = (v: Vec3, tolerance = 0.00001): string => v.map(n => Math.round(n / tolerance)).join(',');
export const distance = (a: Vec3, b: Vec3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export function getBounds(points: Vec3[]): Bounds | null {
  if (!points.length) return null;
  const min: Vec3 = [Infinity, Infinity, Infinity], max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const p of points) for (const k of [0, 1, 2] as const) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
  return { min, max, dimensions: [max[0] - min[0], max[1] - min[1], max[2] - min[2]], center: [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2] };
}
interface Corner { v: number; t: number | null; n: number | null }
interface Face { corners: Corner[]; line: number }
export interface ParsedObj { stats: GeometryStats; positions: Vec3[]; polygons: number[][] }
function index(value: string | undefined, count: number): number | null {
  if (value === undefined || value === '') return null;
  if (!/^[+-]?\d+$/.test(value)) return NaN;
  const n = Number(value);
  return n < 0 ? count + n : n > 0 ? n - 1 : NaN;
}
function boundaries(positions: Vec3[], polygons: number[][]): { count: number; samples: Vec3[]; nonManifold: number } {
  const weld = new Map<string, number>();
  const unique: Vec3[] = [];
  const ids = positions.map(p => {
    const key = pointKey(p, 0.000001); let id = weld.get(key);
    if (id === undefined) { id = unique.length; weld.set(key, id); unique.push(p); }
    return id;
  });
  const edges = new Map<string, { a: number; b: number; count: number }>();
  for (const face of polygons) for (let i = 0; i < face.length; i++) {
    const a = ids[face[i]!]!, b = ids[face[(i + 1) % face.length]!]!;
    if (a === b) continue;
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const edge = edges.get(key); if (edge) edge.count++; else edges.set(key, { a, b, count: 1 });
  }
  const boundary = new Set<number>(); let nonManifold = 0;
  for (const edge of edges.values()) { if (edge.count === 1) { boundary.add(edge.a); boundary.add(edge.b); } if (edge.count > 2) nonManifold++; }
  const all = [...boundary].map(i => unique[i]!);
  const step = Math.max(1, Math.ceil(all.length / 128));
  return { count: all.length, samples: all.filter((_, i) => i % step === 0), nonManifold };
}
export function parseObj(text: string): ParsedObj {
  const positions: Vec3[] = [], uv: number[][] = [], normals: Vec3[] = [], faces: Face[] = [];
  const groups = new Set<string>(), objects = new Set<string>(), materials = new Set<string>(), libraries = new Set<string>();
  const issues: Issue[] = []; let issueOverflow = 0, hasErrors = false;
  const issue = (code: string, message: string, line: number, severity: 'warning' | 'error' = 'error'): void => {
    if (severity === 'error') hasErrors = true;
    if (issues.length < 30) issues.push({ code, message, line, severity }); else issueOverflow++;
  };
  const lines = text.replace(/^\uFEFF/, '').replace(/\\\r?\n/g, ' ').split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.split('#')[0]!.trim(); if (!line) continue;
    const split = line.search(/\s/), command = split < 0 ? line : line.slice(0, split), rest = split < 0 ? '' : line.slice(split).trim();
    if (command === 'v' || command === 'vn' || command === 'vt') {
      const values = rest.split(/\s+/).map(Number), count = command === 'vt' ? 1 : 3;
      if (values.length < count || !values.every(Number.isFinite)) issue('invalid-coordinate', `${command}: coordenadas inválidas`, i + 1);
      const xyz: Vec3 = [values[0] ?? NaN, values[1] ?? (command === 'vt' ? 0 : NaN), values[2] ?? (command === 'vt' ? 0 : NaN)];
      if (command === 'v') {
        // OBJ supports homogeneous coordinates; vertex colors (6/7 values) are not weights.
        if (values.length === 4) { const w = values[3]!; if (w === 0) issue('invalid-weight', 'Coordenada homogénea w=0', i + 1); else for (const k of [0, 1, 2] as const) xyz[k] /= w; }
        if (!xyz.every(Number.isFinite)) issue('non-finite-position', 'Posición no finita después de normalizar coordenadas', i + 1);
        positions.push(xyz);
      } else if (command === 'vn') normals.push(xyz); else uv.push(xyz);
    } else if (command === 'f') {
      const corners = rest.split(/\s+/).map(value => {
        if (!/^[+-]?\d+(?:\/[+-]?\d+|\/(?:[+-]?\d+)?\/[+-]?\d+)?$/.test(value)) issue('invalid-face-token', `Esquina de cara malformada: ${value}`, i + 1);
        const indices = value.split('/');
        return { v: index(indices[0], positions.length) ?? NaN, t: index(indices[1], uv.length), n: index(indices[2], normals.length) };
      });
      faces.push({ corners, line: i + 1 });
    } else if (command === 'g') { for (const g of tokens(rest)) groups.add(g); }
    else if (command === 'o') objects.add(rest);
    else if (command === 'usemtl') materials.add(rest);
    else if (command === 'mtllib') {
      // Unquoted paths with spaces are common exporter output; split only at .mtl boundaries.
      const refs = /["']/.test(rest) ? tokens(rest) : rest.match(/.*?\.mtl(?=\s|$)/gi) ?? [rest];
      for (const name of refs) libraries.add(name.trim());
    }
  }
  const topology = createHash('sha256'), uvIndices = createHash('sha256'), normalIndices = createHash('sha256');
  const polygons: number[][] = []; let cornersTotal = 0, uvCorners = 0, normalCorners = 0, triangles = 0, degenerate = 0;
  for (const face of faces) {
    let valid = face.corners.length >= 3;
    if (!valid) issue('invalid-face', 'Cara con menos de tres vértices', face.line);
    for (const c of face.corners) {
      cornersTotal++;
      for (const [value, size, label] of [[c.v, positions.length, 'v'], [c.t, uv.length, 'vt'], [c.n, normals.length, 'vn']] as const) {
        if (value !== null && (!Number.isInteger(value) || value < 0 || value >= size)) { valid = false; issue('invalid-index', `Índice ${label} fuera de rango`, face.line); }
      }
      if (c.t !== null) uvCorners++; if (c.n !== null) normalCorners++;
    }
    topology.update(face.corners.map(c => c.v).join(',') + ';');
    uvIndices.update(face.corners.map(c => c.t ?? '-').join(',') + ';');
    normalIndices.update(face.corners.map(c => c.n ?? '-').join(',') + ';');
    if (valid) {
      const polygon = face.corners.map(c => c.v); polygons.push(polygon); triangles += polygon.length - 2;
      if (new Set(polygon.map(i => pointKey(positions[i]!))).size < 3) degenerate++;
    }
  }
  if (!positions.length || !faces.length) issue('empty-geometry', 'Se requieren vértices y caras', 0);
  if (degenerate) issue('degenerate-faces', `${degenerate} caras degeneradas`, 0, 'warning');
  const finite = positions.filter(p => p.every(Number.isFinite));
  const valid = !hasErrors;
  const boundary = valid ? boundaries(positions, polygons) : { count: 0, samples: [], nonManifold: 0 };
  const centroid: Vec3 | null = finite.length ? [0, 0, 0] : null;
  if (centroid) for (const p of finite) for (const k of [0, 1, 2] as const) centroid[k] += p[k] / finite.length;
  if (issueOverflow) issues.push({ severity: 'warning', code: 'more-issues', message: `${issueOverflow} incidencias adicionales omitidas` });
  return { positions, polygons, stats: {
    vertexCount: positions.length, normalCount: normals.length, uvCount: uv.length, faceCount: faces.length, triangleCount: triangles,
    groupCount: groups.size, groups: [...groups], objects: [...objects], referencedMaterials: [...materials], materialLibraries: [...libraries],
    bounds: getBounds(finite), centroid, hasUV: uv.length > 0, hasNormals: normals.length > 0,
    uvCoverage: cornersTotal ? uvCorners / cornersTotal : 0, normalCoverage: cornersTotal ? normalCorners / cornersTotal : 0,
    topologyHash: topology.digest('hex'), uvIndexHash: uvIndices.digest('hex'), uvValuesHash: digest(JSON.stringify(uv)),
    normalIndexHash: normalIndices.digest('hex'), positionHash: digest(JSON.stringify(positions)),
    boundaryVertexCount: boundary.count, boundarySamples: boundary.samples, nonManifoldEdgeCount: boundary.nonManifold,
    degenerateFaceCount: degenerate, valid, issues,
  } };
}
export function compareMorph(a: GeometryStats, b: GeometryStats): Pick<MorphPair, 'morphCompatibility' | 'candidate' | 'checks' | 'reasons'> {
  const checks = {
    valid: a.valid && b.valid, vertexCount: a.vertexCount === b.vertexCount, faceCount: a.faceCount === b.faceCount,
    orderedFaceIndices: a.topologyHash === b.topologyHash, uvCount: a.uvCount === b.uvCount,
    uvIndices: a.uvIndexHash === b.uvIndexHash, uvValues: a.uvValuesHash === b.uvValuesHash,
    completeUV: a.uvCoverage === 1 && b.uvCoverage === 1,
    normalLayout: a.normalIndexHash === b.normalIndexHash && a.normalCoverage === b.normalCoverage,
  };
  const reasons = Object.entries(checks).filter(([, value]) => !value).map(([name]) => name);
  const topology = checks.valid && checks.vertexCount && checks.faceCount && checks.orderedFaceIndices;
  const conflictingUV = a.uvCoverage > 0 && b.uvCoverage > 0 && (!checks.uvCount || !checks.uvIndices || !checks.uvValues);
  const morphCompatibility = !topology || conflictingUV ? 'incompatible' : checks.completeUV && checks.normalLayout ? 'exact' : 'probable';
  return { morphCompatibility, candidate: morphCompatibility === 'exact', checks, reasons: reasons.length ? reasons : ['Conectividad ordenada y UV idénticas; validar homología semántica y splits del exportador GLB.'] };
}

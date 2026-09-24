export type Vec3 = [number, number, number];
export type Category = 'body' | 'face' | 'eyes' | 'brows' | 'hair' | 'top' | 'bottom' | 'hands' | 'feet/shoes' | 'arm accessories' | 'leg accessories' | 'ear accessories' | 'other accessories' | 'merged characters' | 'props' | 'effects' | 'environment' | 'unknown';
export type BuildVariant = 'Standard' | 'Fat' | 'Strong' | null;
export type Confidence = 'confirmed' | 'probable' | 'candidate' | 'unresolved';
export type MorphCompatibility = 'exact' | 'probable' | 'incompatible';
export type TextureRole = 'baseColor' | 'diffuse' | 'albedo' | 'normal' | 'roughness' | 'metallic' | 'AO' | 'emissive' | 'opacity' | 'mask' | 'other';
export interface Source { id: string; path: string; kind: 'mixed' | 'mesh' | 'texture' | 'preview' }
export interface ScanConfig { sources: Source[] }
export interface FileRef { sourceId: string; relativePath: string }
export interface FileRecord extends FileRef { id: string; name: string; extension: string; sizeBytes: number; sha256: string; path: string }
export interface Issue { code: string; severity: 'warning' | 'error'; message: string; line?: number }
export interface Bounds { min: Vec3; max: Vec3; dimensions: Vec3; center: Vec3 }
export interface GeometryStats {
  vertexCount: number; normalCount: number; uvCount: number; faceCount: number; triangleCount: number;
  groupCount: number; groups: string[]; objects: string[]; referencedMaterials: string[]; materialLibraries: string[];
  bounds: Bounds | null; centroid: Vec3 | null; hasUV: boolean; hasNormals: boolean;
  uvCoverage: number; normalCoverage: number; topologyHash: string; uvIndexHash: string; uvValuesHash: string;
  normalIndexHash: string; positionHash: string; boundaryVertexCount: number; boundarySamples: Vec3[];
  nonManifoldEdgeCount: number; degenerateFaceCount: number; valid: boolean; issues: Issue[];
}
export interface Classification {
  category: Category; family: string | null; morphFamily: string; archetype: string | null;
  buildVariant: BuildVariant; lod: number | null; quality: 'high' | 'default'; lodKey: string;
  excluded: boolean; reasons: string[]; evidence: string[];
}
export interface MeshRecord extends FileRecord, Classification { geometry: GeometryStats; derivedFrom?: { method: string; sourceMeshIds: string[] } }
export interface ImageRecord extends FileRecord {
  usage: 'texture' | 'preview'; role: TextureRole; family: string | null; archetype: string | null;
  width: number | null; height: number | null; alpha: boolean | null; format: string;
  inspection: 'header' | 'unsupported' | 'failed'; issues: Issue[]; duplicateOf: string | null;
}
export interface MapDefinition { role: TextureRole; path: string; directive: string }
export interface MaterialDefinition { name: string; fileId: string; maps: MapDefinition[]; diffuse: Vec3 | null; opacity: number | null }
export interface MaterialRecord extends FileRecord { definitions: MaterialDefinition[]; issues: Issue[] }
export interface EvidenceLink { imageId: string; confidence: Confidence; evidence: string[]; material?: string }
export interface TextureVariant { id: string; name: string; confidence: Confidence; maps: Partial<Record<TextureRole, string[]>>; evidence: string[]; requiresVisualValidation: boolean }
export interface AssetDefinition {
  id: string; name: string; category: Category; family: string | null; archetype: string | null;
  archetypeCandidates: string[]; mesh: MeshRecord; lods: (FileRef & { meshId: string; lod: number | null; quality: string; vertexCount: number; faceCount: number; valid: boolean })[];
  preview: EvidenceLink | null; previewCandidates: EvidenceLink[]; materials: MaterialDefinition[];
  textureVariants: TextureVariant[]; tintable: boolean | { hair: boolean | 'unknown'; eyes: boolean | 'unknown'; clothing?: boolean | 'unknown'; reason: string };
  variants: { build: BuildVariant; relatedAssetIds: string[] };
  compatibility: { relationIds: string[]; morphIds: string[] };
  metadata: { skinReference?: string; skinRegions?: number[][]; status: 'candidate' | 'excluded' | 'needs-review'; mainApplication: boolean; reasons: string[]; rigged: boolean; textureStatus: 'referenced' | 'reviewed' | 'candidates-only' | 'missing'; preparedMorphTargets?: string[]; renderSide?: 'front' | 'double'; shading?: 'anime-static'; calibration?: { fbxImportScale: number; axes: string; staticRestPose: boolean } };
}
export interface MorphPair { id: string; a: string; b: string; morphCompatibility: MorphCompatibility; candidate: boolean; checks: Record<string, boolean>; reasons: string[] }
export interface PieceRelation {
  id: string; a: string; b: string; kind: 'merged-evidence' | 'basebody-junction' | 'face-body';
  confidence: Confidence; status: 'supported' | 'candidate' | 'incompatible' | 'unresolved';
  evidence: string[]; metrics: Record<string, number | null>; sourceMeshIds: string[];
}
export interface Preset {
  displayName?: string;
  outfitLabel?: string;
  id: string; name: string; archetype: string | null; buildVariant: BuildVariant; sourceMeshIds: string[];
  bodyFamily: string | null; hairFamily: string | null; bodyAssetIds: string[]; hairAssetIds: string[];
  missingParts: string[]; status: 'geometry-supported' | 'candidate' | 'incomplete'; completeCharacter: false;
  evidence: string[];
}
export interface CompatibilityCatalog {
  schemaVersion: 1; morphPairs: MorphPair[]; pieceRelations: PieceRelation[];
  baseBody: { assetIds: string[]; missingNames: string[]; completeCharacter: false; conclusion: string };
  limitations: string[];
}
export interface AssetCatalog { schemaVersion: 1; sources: Source[]; assets: AssetDefinition[]; images: ImageRecord[]; materials: MaterialRecord[]; relatedFiles: FileRecord[] }
export interface InspectionReport {
  schemaVersion: 1; summary: Record<string, number>; categories: Record<string, number>; families: { family: string; assetIds: string[] }[];
  meshes: MeshRecord[]; images: ImageRecord[]; materials: MaterialRecord[]; relatedFiles: FileRecord[];
  assetsWithoutTexture: string[]; assetsWithoutConfirmedTexture: string[]; assetsWithoutPreview: string[];
  problematicFiles: { id: string; path: string; issues: Issue[] }[]; warnings: string[]; recommendations: string[];
  manifestHash: string;
}


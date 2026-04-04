export interface MineralEntry {
  name: string
  formula?: string
  percentage: number
}

export interface AsteroidShape {
  dimensions: [number, number, number]
  elongation: number
  lobeCount: number
  irregularity: number
}

export interface SurfaceFeatures {
  craterDensity: number
  craterMaxScale: number
  boulderDensity: number
  ridgeFrequency: number
  roughness: number
  dustCoverage: number
}

export interface VisualProperties {
  albedo: number
  baseColor: [number, number, number]
  accentColor: [number, number, number]
  emissive: boolean
  emissiveColor?: [number, number, number]
  emissiveIntensity?: number
  metalness: number
  roughnessMap: number
}

export interface PhysicalProperties {
  mass: number
  density: number
  surfaceGravity: number
  rotationPeriod: number
  surfaceTemperature: number
}

export interface AsteroidDefinition {
  id: string
  name: string
  designation: string
  type: string
  biome: string
  description: string
  composition: MineralEntry[]
  shape: AsteroidShape
  surface: SurfaceFeatures
  visual: VisualProperties
  physical: PhysicalProperties
}

export interface MineralVisual {
  color: [number, number, number]
  metalness: number
  roughness: number
  emissive: boolean
}

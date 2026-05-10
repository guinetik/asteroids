/**
 * Registry that maps ROM ids from arcade-roms.json to factory functions.
 *
 * @author guinetik
 * @date 2026-05-10
 * @spec docs/superpowers/specs/2026-05-09-arcade-asteroids-design.md
 */
import type { ArcadeRom, ArcadeRomDeps, ArcadeRomFactory, RomMeta } from './types'

/** Map of ROM id to its factory function. */
export type ArcadeRomFactoryMap = Record<string, ArcadeRomFactory>

/**
 * Holds the catalog of available ROMs and resolves factories by id. Fails loud
 * at construction time when a meta entry has no factory or ids collide.
 */
export class ArcadeRomRegistry {
  private readonly catalog: ReadonlyArray<RomMeta>
  private readonly factories: ArcadeRomFactoryMap

  /**
   * Build a registry from metadata + factory map.
   *
   * @param catalog - Ordered list of ROM metadata (typically `arcade-roms.json`).
   * @param factories - Map of id → factory. Must cover every catalog id.
   */
  constructor(catalog: ReadonlyArray<RomMeta>, factories: ArcadeRomFactoryMap) {
    const seen = new Set<string>()
    for (const meta of catalog) {
      if (seen.has(meta.id)) {
        throw new Error(`ArcadeRomRegistry: duplicate id "${meta.id}" in catalog`)
      }
      seen.add(meta.id)
      if (!factories[meta.id]) {
        throw new Error(`ArcadeRomRegistry: no factory registered for id "${meta.id}"`)
      }
    }
    this.catalog = catalog
    this.factories = factories
  }

  /** Return the catalog in declaration order. */
  list(): ReadonlyArray<RomMeta> {
    return this.catalog
  }

  /**
   * Construct a ROM by id.
   *
   * @param id - Catalog id.
   * @param deps - Per-instance dependencies.
   * @returns A fresh ROM instance.
   */
  create(id: string, deps: ArcadeRomDeps): ArcadeRom {
    const factory = this.factories[id]
    if (!factory) throw new Error(`ArcadeRomRegistry: unknown ROM id "${id}"`)
    return factory(deps)
  }
}

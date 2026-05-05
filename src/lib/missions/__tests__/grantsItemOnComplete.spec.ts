/**
 * Tests for the `grantsItemOnComplete` field on {@link GeneratedAsteroidMission}.
 *
 * Covers the four cases per crate type (mineral + DAN):
 *   A. zero held + active deliver step → grants once
 *   B. lost crate (zero held) after death + deliver step still active → re-grants (same as A)
 *   C. player already holds count + deliver step active → does NOT grant (dedup guard)
 *   D. deliver step has advanced (no active contract waiting for itemId) → does NOT grant
 *
 * @author guinetik
 * @date 2026-05-05
 * @spec docs/superpowers/specs/2026-05-05-ceres-station-dock-system-design.md
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { persistCompletedAsteroidMissionRewards } from '../asteroidMissionRewards'
import { ACTIVE_MISSION_KEY } from '../missionStorage'
import { createProfile, saveProfile } from '@/lib/player/profile'
import { loadInventory, saveInventory } from '@/lib/inventory/inventoryStorage'
import { createInventory, addItem } from '@/lib/inventory/inventory'
import type { GeneratedAsteroidMission } from '../types'
import { contractSystem } from '@/lib/contracts/runtime'
import type { ContractInstance } from '@/lib/contracts/contractTypes'

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const BASE_MISSION: GeneratedAsteroidMission = {
  kind: 'special',
  id: 'test-grants-item-mission',
  asteroidId: 'bennu',
  giverId: 'ceres-institute',
  giverName: 'Ceres Institute',
  templateId: 'ceres_mineral_analysis',
  name: 'Mineral Analysis',
  briefing: '',
  difficulty: 5,
  region: 'asteroid-belt',
  objectives: [{ type: 'mineral-analysis', x: 0, z: 0, analysisRockCount: 2, sampleKg: 25, reward: 1000 }],
  totalReward: 1000,
  waypoint: { worldX: 0, worldZ: 0 },
  status: 'in-transit',
}

/** Build an active ContractInstance stub at a given step index. */
function makeActiveInstance(
  contractId: string,
  currentStepIndex: number,
  stepCount = 6,
): ContractInstance {
  return {
    contractId,
    status: 'active',
    currentStepIndex,
    stepCounters: Array.from<number>({ length: stepCount }).fill(0),
    offeredAt: '2026-05-05T00:00:00Z',
    acceptedAt: '2026-05-05T00:01:00Z',
    completedAt: null,
    resolvedOutcomeId: null,
  }
}

// ---------------------------------------------------------------------------
// Helper — mock contractSystem.listActiveInstances + getContract
// ---------------------------------------------------------------------------

/**
 * Stubs `contractSystem.listActiveInstances()` to return the given instances
 * and `contractSystem.getContract()` to return a minimal contract whose step at
 * `stepIndex` has `kind: 'deliver-to-asset'` with `itemId`.
 *
 * Pass `null` to make `getContract` return null (simulates no matching contract).
 */
function stubContractSystemWithDeliveryStep(
  instances: ContractInstance[],
  itemId: string | null,
  stepIndex = 0,
): void {
  vi.spyOn(contractSystem, 'listActiveInstances').mockReturnValue(instances)
  vi.spyOn(contractSystem, 'getContract').mockImplementation((id: string) => {
    if (itemId === null) return null
    // Build a minimal contract with one deliver-to-asset step at stepIndex
    const steps = Array.from({ length: Math.max(stepIndex + 1, 1) }, (_, i) => {
      if (i === stepIndex) {
        return {
          kind: 'deliver-to-asset' as const,
          assetRef: 'ceres-institute-dock',
          itemId,
          count: 1,
          subject: 'Deliver to Ceres',
          flavor: ['Bring the crate.'],
        }
      }
      return {
        kind: 'visit-planet' as const,
        planetId: 'ceres',
        subject: 'Visit Ceres',
        flavor: ['Go to Ceres.'],
      }
    })
    return {
      id,
      from: 'Ceres Institute',
      inboxName: 'Ceres Institute',
      introSubject: '',
      introBody: [],
      completionSubject: '',
      completionBody: [],
      sentAt: '2026-05-05',
      steps,
      rewards: [],
    }
  })
}

// ---------------------------------------------------------------------------
// Test suites — one for each crate type
// ---------------------------------------------------------------------------

type CrateConfig = {
  label: string
  itemId: string
  missionId: string
}

const CRATE_CONFIGS: CrateConfig[] = [
  {
    label: 'mineral analysis crate',
    itemId: 'ceres-mineral-results-crate',
    missionId: 'ceres-mineral-analysis-mission',
  },
  {
    label: 'DAN survey crate',
    itemId: 'ceres-dan-results-crate',
    missionId: 'ceres-dan-survey-mission',
  },
]

for (const { label, itemId, missionId } of CRATE_CONFIGS) {
  describe(`grantsItemOnComplete — ${label}`, () => {
    beforeEach(() => {
      localStorage.clear()
      const profile = createProfile('Test')
      saveProfile(profile)
    })

    afterEach(() => {
      vi.restoreAllMocks()
      localStorage.clear()
    })

    /** Build a mission with grantsItemOnComplete for this crate. */
    function makeMission(): GeneratedAsteroidMission {
      const m: GeneratedAsteroidMission = {
        ...BASE_MISSION,
        id: missionId,
        grantsItemOnComplete: {
          itemId,
          count: 1,
          replenishWhileStepOpen: true,
        },
      }
      localStorage.setItem(ACTIVE_MISSION_KEY, JSON.stringify(m))
      return m
    }

    it('A. zero held + active deliver step → grants item once', () => {
      const mission = makeMission()
      // Empty inventory — player holds zero
      saveInventory(createInventory())

      // Active contract at step 0 (a deliver-to-asset step waiting for itemId)
      const instance = makeActiveInstance('ceres-dock-contract', 0)
      stubContractSystemWithDeliveryStep([instance], itemId, 0)

      persistCompletedAsteroidMissionRewards(mission, 1)

      const inv = loadInventory()
      expect(inv?.stacks.find((s) => s.itemId === itemId)?.quantity).toBe(1)
    })

    it('B. lost crate after death (zero held) + deliver step still active → re-grants', () => {
      const mission = makeMission()
      // Simulate the crate was lost on death — inventory is empty again
      saveInventory(createInventory())

      const instance = makeActiveInstance('ceres-dock-contract', 0)
      stubContractSystemWithDeliveryStep([instance], itemId, 0)

      // Simulate re-run: first run granted the crate, then player died and lost it.
      // Mission is re-accepted (same mission id) and completed again.
      persistCompletedAsteroidMissionRewards(mission, 1)

      const inv = loadInventory()
      expect(inv?.stacks.find((s) => s.itemId === itemId)?.quantity).toBe(1)
    })

    it('C. player already holds count + deliver step active → does NOT grant again', () => {
      const mission = makeMission()
      // Inventory already has the crate (player completed and holds it)
      const inv0 = createInventory()
      const filled = addItem(inv0, itemId, 1)
      expect(filled.ok).toBe(true)
      saveInventory(filled.inventory)

      const instance = makeActiveInstance('ceres-dock-contract', 0)
      stubContractSystemWithDeliveryStep([instance], itemId, 0)

      persistCompletedAsteroidMissionRewards(mission, 1)

      const inv = loadInventory()
      // Should still be exactly 1, not 2
      expect(inv?.stacks.find((s) => s.itemId === itemId)?.quantity).toBe(1)
    })

    it('D. deliver step has advanced (no contract waiting for itemId) → does NOT grant', () => {
      const mission = makeMission()
      // Inventory is empty — player held the crate but already delivered it
      saveInventory(createInventory())

      // No active contract with a deliver step waiting for this itemId
      stubContractSystemWithDeliveryStep([], null, 0)

      persistCompletedAsteroidMissionRewards(mission, 1)

      const inv = loadInventory()
      // Chain has moved on — no re-grant
      expect(inv?.stacks.find((s) => s.itemId === itemId)).toBeUndefined()
    })
  })
}

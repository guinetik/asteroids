<script setup lang="ts">
import { computed } from 'vue'
import { UPGRADE_DEFINITIONS, type UpgradeId } from '@/lib/upgrades'
import TutorialProgramManual from './TutorialProgramManual.vue'
import type { TutorialProgramBadge, TutorialProgramManualModel } from './tutorialProgramTypes'

const NO_LANDER_UPGRADES_INSTALLED =
  'Installed lander packages: none. Visit the Engineering Bay at a spaceport.'

const props = defineProps<{
  upgradeLevels?: Partial<Record<UpgradeId, number>>
  dockedPlanet?: string | null
  playerName?: string
}>()

defineEmits<{
  'switch-to-upgrades': []
}>()

const headerBadges = computed<readonly TutorialProgramBadge[]>(() => {
  const badges: TutorialProgramBadge[] = [
    {
      label: 'Class',
      value: 'Surface',
    },
    {
      label: 'Gravity',
      value: '3.0G',
      warning: true,
    },
  ]

  if (props.dockedPlanet) {
    badges.push({
      label: 'Docked',
      value: props.dockedPlanet,
    })
  }

  return badges
})

const installedLanderUpgrades = computed(() => {
  if (!props.upgradeLevels) return []

  return (Object.entries(props.upgradeLevels) as [UpgradeId, number | undefined][])
    .filter(([id, level]) => id.startsWith('lander') && (level ?? 0) > 0)
    .map(([id, level]) => {
      const definition = UPGRADE_DEFINITIONS[id]
      return `${definition.label} (${id}) MK.${level}`
    })
})

const installedUpgradeNote = computed(() => {
  if (installedLanderUpgrades.value.length === 0) return NO_LANDER_UPGRADES_INSTALLED

  return `Installed lander packages: ${installedLanderUpgrades.value.join(', ')}.`
})

const operatorName = computed(() => props.playerName || 'unregistered operator')

const manual = computed<TutorialProgramManualModel>(() => ({
  issuer: 'Jovian Society / Cloud City Field Engineering',
  title: 'Surface Lander Field Manual',
  documentCode: 'JS-CCFE-LANDER-SURF-3.1',
  accent: 'jovian',
  badges: headerBadges.value,
  chapters: [
    {
      id: 'summary',
      navLabel: 'Summary',
      title: 'Surface Extraction Vehicle Summary',
      subtitle: 'Industrial field platform for high-gravity surface work and orbital return.',
      readouts: [
        {
          label: 'Assigned operator',
          value: operatorName.value,
          caption: 'Terminal account used for checklist acknowledgement and upgrade records.',
        },
        {
          label: 'Primary role',
          value: 'Extraction and return',
          caption: 'Deploy for surface resources, rescue support, combat support, and ascent.',
        },
      ],
      cards: [
        {
          label: 'ROLE',
          title: 'Surface extraction platform',
          body:
            'The lander moves between orbit and hazardous terrain so the pilot can mine, survey, ' +
            'recover personnel, and bring payloads back to the shuttle.',
          tone: 'safe',
        },
        {
          label: 'SUPPORT',
          title: 'Combat and rescue vehicle',
          body:
            'Use the hull, maneuvering authority, and vertical lift to support surface fights or ' +
            'reach stranded targets. The vehicle is rugged, not disposable.',
          tone: 'warning',
        },
        {
          label: 'RETURN',
          title: 'Ascent is part of the mission',
          body:
            'Reserve fuel and charge for return-to-orbit work. A successful extraction still fails ' +
            'if the vehicle cannot climb clear of the gravity well.',
          tone: 'danger',
        },
      ],
    },
    {
      id: 'controls',
      navLabel: 'Controls',
      title: 'Flight And Surface Controls',
      subtitle: 'Large mass, high authority, delayed forgiveness.',
      cards: [
        {
          label: 'MAIN',
          title: 'Main engine',
          body:
            'Fire the main engine to arrest descent, lift away from the ground, and climb toward ' +
            'orbit. It has the authority to stop a hard drop, but it spends charge quickly.',
          tone: 'safe',
        },
        {
          label: 'RCS',
          title: 'Translation thrusters',
          body:
            'Use RCS translation for forward, backward, and lateral positioning near terrain. ' +
            'Short pulses are easier to correct than sustained drift.',
          tone: 'neutral',
        },
        {
          label: 'YAW',
          title: 'Rotate the frame',
          body:
            'Yaw points the lander for the next correction without cancelling momentum. Rotate ' +
            'early so translation thrust is aligned before the surface rushes up.',
          tone: 'neutral',
        },
        {
          label: 'VERTICAL',
          title: 'Ascend and descend',
          body:
            'Ascend input boosts climb and terrain clearance. Descend input commits to a lower ' +
            'profile; use it only when the landing zone is already under control.',
          tone: 'warning',
        },
        {
          label: 'RETRO',
          title: 'Retro-brake',
          body:
            'The retro-brake fires opposing RCS to damp lateral velocity. Use it before touchdown ' +
            'or slope contact turns sideways motion into hull damage.',
          tone: 'safe',
        },
      ],
    },
    {
      id: 'power',
      navLabel: 'Power',
      title: 'Fuel, Charge, And Heavy Momentum',
      subtitle: 'One fuel pool feeds separate engine and RCS charge budgets.',
      readouts: [
        {
          label: 'Fuel pool',
          value: 'Shared',
          caption: 'Main engine and RCS both depend on the same stored fuel.',
        },
        {
          label: 'Charge',
          value: 'Per group',
          caption: 'Engine and maneuvering capacitors recover separately while idle.',
        },
        {
          label: 'Mass behavior',
          value: 'Heavy',
          caption: 'Momentum persists until thrust, brake, ground contact, or impact changes it.',
        },
      ],
      cards: [
        {
          label: 'RECHARGE',
          title: 'Idle groups recharge from fuel',
          body:
            'A depleted engine or RCS group automatically recovers charge when idle, consuming ' +
            'fuel from the shared tank. Full charge does not drain fuel.',
          tone: 'neutral',
        },
        {
          label: 'EMPTY',
          title: 'No fuel means no recharge',
          body:
            'When the tank is empty, each group can only spend its remaining charge. Plan landing ' +
            'and ascent around the fuel needed to rebuild charge after hard burns.',
          tone: 'danger',
        },
        {
          label: 'MOMENTUM',
          title: 'Mass keeps moving',
          body:
            'The lander is heavy enough that lateral drift and descent speed linger. Correct early, ' +
            'then verify the velocity is truly gone before committing to contact.',
          tone: 'warning',
        },
      ],
    },
    {
      id: 'landing',
      navLabel: 'Landing',
      title: 'Surface Landing Tolerances',
      subtitle: 'Touchdown is a controlled transfer of energy, not arrival.',
      readouts: [
        {
          label: 'Caution speed',
          value: '7.0 m/s',
          caption: 'Descent warning begins at this contact speed; slow down before touchdown.',
        },
        {
          label: 'Damage speed',
          value: '12.0 m/s',
          caption: 'Impact damage threshold. Below this speed, vertical contact is tolerated.',
        },
        {
          label: 'Safe tilt',
          value: '15 deg',
          caption: 'Maximum frame tilt from vertical before touchdown risk rises.',
        },
        {
          label: 'Terrain',
          value: 'Flat advised',
          caption: 'Gentle slope contact is tolerated; hard impacts make slope and tilt hazardous.',
        },
      ],
      cards: [
        {
          label: 'SPEED',
          title: 'Burn before the alarm',
          body:
            'Use the main engine to reduce descent before the warning begins at 7.0 m/s. Impacts ' +
            'at 12.0 m/s or faster cross the damage threshold even with the landing legs extended.',
          tone: 'danger',
        },
        {
          label: 'TILT',
          title: 'Keep the frame upright',
          body:
            'Gentle contact can tolerate imperfect attitude, but warning-range impacts amplify tilt ' +
            'into hull stress. Use yaw and RCS corrections before the legs meet ground.',
          tone: 'warning',
        },
        {
          label: 'SLOPE',
          title: 'Flat ground is mission equipment',
          body:
            'Flat terrain keeps liftoff authority and landing risk predictable. Slopes become ' +
            'dangerous when touchdown speed enters the caution or crash range.',
          tone: 'danger',
        },
      ],
      note:
        'Cloud City Field Engineering classifies flat landing zone selection as a vehicle safety ' +
        'system. Gentle slope parking is tolerated, but high-speed slope contact is a failed ' +
        'pre-flight check.',
    },
    {
      id: 'upgrades',
      navLabel: 'Upgrades',
      title: 'Lander Upgrade Effects',
      subtitle: 'Engineering Bay tiers improve the coefficients that keep heavy vehicles alive.',
      readouts: [
        {
          label: 'Installed',
          value: String(installedLanderUpgrades.value.length),
          caption:
            installedLanderUpgrades.value.length === 1
              ? 'lander package active'
              : 'lander packages active',
        },
        {
          label: 'Service access',
          value: props.dockedPlanet ? 'Docked' : 'Undocked',
          caption: 'Upgrade work is performed through station or spaceport engineering services.',
        },
      ],
      cards: [
        {
          label: 'THRUST',
          title: 'Engine authority',
          body:
            'Thrust and engine response upgrades improve the main engine margin used for braking, ' +
            'liftoff, and return-to-orbit climbs.',
          tone: 'safe',
        },
        {
          label: 'FUEL',
          title: 'Capacity and recharge endurance',
          body:
            'Fuel upgrades extend descent, surface maneuvering, capacitor recovery, and the ascent ' +
            'reserve needed after a busy extraction.',
          tone: 'neutral',
        },
        {
          label: 'HULL',
          title: 'Damage tolerance',
          body:
            'Hull plating increases survivability during combat support, rough rescue approaches, ' +
            'and marginal landings. It does not make steep slopes safe.',
          tone: 'warning',
        },
      ],
      note: installedUpgradeNote.value,
      showUpgradeAction: true,
    },
    {
      id: 'protocol',
      navLabel: 'Protocol',
      title: 'Operational Protocol',
      subtitle: 'Surface sortie procedure for extraction, support, and return.',
      checklist: [
        {
          title: 'Confirm sortie role',
          body:
            'Use the lander for surface extraction, combat or rescue support, and return-to-orbit ' +
            'vehicle work. Use the shuttle for orbital transit and station service.',
        },
        {
          title: 'Reserve ascent resources',
          body:
            'Before descent, verify enough fuel and charge margin remains for landing corrections, ' +
            'surface repositioning, and the climb back to orbit.',
        },
        {
          title: 'Pick flat ground',
          body:
            'Reject crater walls, steep ridges, and uneven ledges. Flat terrain reduces slope ' +
            'damage risk and gives the main engine time to recover control.',
        },
        {
          title: 'Stabilize before contact',
          body:
            'Damp lateral drift with retro-brake, keep tilt within tolerance, and let touchdown ' +
            'happen only after velocity is under control.',
        },
      ],
    },
  ],
}))
</script>

<template>
  <TutorialProgramManual :manual="manual" @switch-to-upgrades="$emit('switch-to-upgrades')" />
</template>

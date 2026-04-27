<script setup lang="ts">
import { computed } from 'vue'
import type { ShuttleTelemetry } from '@/lib/ShuttleTelemetry'
import { UPGRADE_DEFINITIONS, type UpgradeId } from '@/lib/upgrades'
import TutorialProgramManual from './TutorialProgramManual.vue'
import type { TutorialProgramBadge, TutorialProgramManualModel } from './tutorialProgramTypes'

const LOW_FUEL_PERCENT = 25
const LOW_HULL_PERCENT = 35
const HOT_TEMPERATURE_WARNING = 85
const COLD_TEMPERATURE_WARNING = -85
const PERCENT_SCALE = 100
const NO_TELEMETRY_BADGE = 'No signal'
const NO_UPGRADES_INSTALLED =
  'Installed packages: none. Visit the Engineering Bay at a station or spaceport.'

const props = defineProps<{
  telemetry?: ShuttleTelemetry | null
  upgradeLevels?: Partial<Record<UpgradeId, number>>
  dockedPlanet?: string | null
  playerName?: string
}>()

defineEmits<{
  'switch-to-upgrades': []
}>()

const fuelPercent = computed(() => {
  const telemetry = props.telemetry
  if (!telemetry || telemetry.fuelCapacity <= 0) return null

  return Math.round((telemetry.fuelLevel / telemetry.fuelCapacity) * PERCENT_SCALE)
})

const hullPercent = computed(() => {
  const telemetry = props.telemetry
  if (!telemetry || telemetry.maxHp <= 0) return null

  return Math.round((telemetry.hp / telemetry.maxHp) * PERCENT_SCALE)
})

const temperatureValue = computed(() => props.telemetry?.temperature ?? null)

const telemetryBadges = computed<readonly TutorialProgramBadge[]>(() => {
  const badges: TutorialProgramBadge[] = [
    {
      label: 'Fuel',
      value: fuelPercent.value === null ? NO_TELEMETRY_BADGE : `${fuelPercent.value}%`,
      warning: fuelPercent.value !== null && fuelPercent.value <= LOW_FUEL_PERCENT,
    },
    {
      label: 'Hull',
      value: props.telemetry
        ? `${Math.round(props.telemetry.hp)}/${Math.round(props.telemetry.maxHp)}`
        : NO_TELEMETRY_BADGE,
      warning: hullPercent.value !== null && hullPercent.value <= LOW_HULL_PERCENT,
    },
    {
      label: 'Temp',
      value:
        temperatureValue.value === null
          ? NO_TELEMETRY_BADGE
          : `${Math.round(temperatureValue.value)} deg`,
      warning:
        temperatureValue.value !== null &&
        (temperatureValue.value >= HOT_TEMPERATURE_WARNING ||
          temperatureValue.value <= COLD_TEMPERATURE_WARNING),
    },
  ]

  if (props.dockedPlanet) {
    badges.push({
      label: 'Docked',
      value: props.dockedPlanet,
      warning: false,
    })
  }

  return badges
})

const installedUpgradeLabels = computed(() => {
  if (!props.upgradeLevels) return []

  return (Object.entries(props.upgradeLevels) as [UpgradeId, number | undefined][])
    .filter(([, level]) => (level ?? 0) > 0)
    .map(([id, level]) => {
      const definition = UPGRADE_DEFINITIONS[id]
      return `${definition.label} MK.${level}`
    })
})

const installedUpgradeNote = computed(() => {
  if (installedUpgradeLabels.value.length === 0) return NO_UPGRADES_INSTALLED

  return `Installed packages: ${installedUpgradeLabels.value.join(', ')}.`
})

const pilotName = computed(() => props.playerName || 'unregistered pilot')

const manual = computed<TutorialProgramManualModel>(() => ({
  issuer: 'Vale Orbital Refurb',
  title: 'Shuttle Owner/Operator Manual',
  documentCode: 'VOR-SHUTTLE-OPS-0.8',
  accent: 'vale',
  badges: telemetryBadges.value,
  chapters: [
    {
      id: 'summary',
      navLabel: 'Summary',
      title: 'Refurbished Shuttle Summary',
      subtitle: 'Owner/operator briefing for orbital and interplanetary service.',
      readouts: [
        {
          label: 'Registered operator',
          value: pilotName.value,
          caption: 'Vale transfers custody to the pilot holding the terminal account.',
        },
        {
          label: 'Primary role',
          value: 'Transit and station service',
          caption: 'Use the shuttle for orbit work, planet transfers, cargo, and upgrades.',
        },
      ],
      cards: [
        {
          label: 'VESSEL',
          title: 'Refurbished frame, modern systems',
          body:
            'The hull started as an old print-pattern lander frame, then Vale rebuilt it for ' +
            'shuttle duty with neutron thrust, charge capacitors, and slingshot coupling.',
          tone: 'neutral',
        },
        {
          label: 'SERVICE',
          title: 'Stations keep the shuttle alive',
          body:
            'Dock at stations and spaceports to refuel tanks, repair hull plating, sell cargo, ' +
            'visit the shop, review mission work, and open the Engineering Bay.',
          tone: 'safe',
        },
        {
          label: 'VALE NOTE',
          title: 'Do not fly the ledger empty',
          body:
            'Fuel, charge, hull, and temperature all matter. A good pilot leaves a margin before ' +
            'starting the next burn or slingshot run.',
          tone: 'warning',
        },
      ],
    },
    {
      id: 'controls',
      navLabel: 'Controls',
      title: 'Flight And Orbit Controls',
      subtitle: 'Momentum persists until you spend thrust, brake charge, or gravity.',
      cards: [
        {
          label: 'THRUST',
          title: 'Main thrust',
          body:
            'Apply forward thrust in the direction the shuttle nose is facing. Burn in short, ' +
            'planned pulses when matching orbit or setting up a transfer.',
          tone: 'safe',
        },
        {
          label: 'BRAKE',
          title: 'Retro brake',
          body:
            'Brake input fights current velocity with dampeners. It is useful for docking and ' +
            'emergency corrections, but it spends charge and fuel quickly.',
          tone: 'warning',
        },
        {
          label: 'YAW',
          title: 'Rotate before you burn',
          body:
            'Yaw turns the chassis without cancelling velocity. Point the nose where the next burn ' +
            'should add or remove momentum, then thrust.',
          tone: 'neutral',
        },
        {
          label: 'ORBIT',
          title: 'Hold orbit and release',
          body:
            'Use orbit controls inside a gravity well to capture, charge the slingshot, aim ' +
            'prograde, and release only when the projected path is clear.',
          tone: 'safe',
        },
      ],
      note:
        'Marta says: the shuttle goes where the math says, not where your hand wishes it would go.',
    },
    {
      id: 'power',
      navLabel: 'Power',
      title: 'Fuel, Charge, And Thruster Groups',
      subtitle: 'One tank feeds several capacitors.',
      readouts: [
        {
          label: 'Fuel pool',
          value: 'Shared',
          caption: 'All shuttle systems draw from the same fuel reserve.',
        },
        {
          label: 'Charge bars',
          value: 'Per group',
          caption: 'Main thrust, brake, and maneuvering groups each recover separately.',
        },
      ],
      cards: [
        {
          label: 'FUEL',
          title: 'Shared tank discipline',
          body:
            'Every thruster group ultimately depends on the shuttle fuel pool. Empty tanks stop ' +
            'automatic recharge and leave you with only whatever charge is already stored.',
          tone: 'warning',
        },
        {
          label: 'CHARGE',
          title: 'Idle groups recharge',
          body:
            'When a thruster group is idle and below full charge, it recharges from the shared ' +
            'tank. Full charge does not drain fuel, but recovering spent charge does.',
          tone: 'neutral',
        },
        {
          label: 'BURN RATE',
          title: 'Main, brake, and yaw feel different',
          body:
            'Main thrust, dampener brake, and yaw control have separate charge behavior. Treat ' +
            'each bar as its own short-term budget during a maneuver.',
          tone: 'safe',
        },
      ],
    },
    {
      id: 'slingshot',
      navLabel: 'Slingshot',
      title: 'Gravity Slingshot Procedure',
      subtitle: 'Capture, charge, aim, release.',
      checklist: [
        {
          title: 'Enter the gravity well',
          body:
            'Approach a planet with enough margin to avoid impact. Capture or hold orbit before ' +
            'building slingshot charge.',
        },
        {
          title: 'Charge while captured',
          body:
            'Let the slingshot system build charge during the orbital hold. Watch fuel and ' +
            'trajectory instead of forcing an early departure.',
        },
        {
          title: 'Aim prograde',
          body:
            'Point the release vector along the desired escape path. Prograde alignment turns the ' +
            'planet into free speed; poor alignment wastes the run.',
        },
        {
          title: 'Release on a clear path',
          body:
            'Release only when the projected line avoids the planet, stations, and other impact ' +
            'hazards. Red or collision-facing paths are abort conditions.',
        },
      ],
      cards: [
        {
          label: 'CAPTURE',
          title: 'The planet does the heavy lifting',
          body:
            'A good slingshot uses the gravity well to redirect velocity before the final release. ' +
            'Burning constantly through the approach defeats the point.',
          tone: 'safe',
        },
        {
          label: 'RELEASE',
          title: 'Speed is not control',
          body:
            'The slingshot can launch the shuttle hard. Keep enough fuel and charge after release ' +
            'for correction burns at the destination.',
          tone: 'warning',
        },
      ],
    },
    {
      id: 'hazards',
      navLabel: 'Hazards',
      title: 'Thermal And Impact Risks',
      subtitle: 'Space is mostly empty until it is suddenly expensive.',
      cards: [
        {
          label: 'HEAT',
          title: 'Inner-system temperature climbs',
          body:
            'Solar proximity and hot zones push hull temperature upward. Heat shielding buys time, ' +
            'not permission to loiter forever.',
          tone: 'danger',
        },
        {
          label: 'COLD',
          title: 'Outer-system cold drains safety margins',
          body:
            'Deep cold can threaten the shuttle outside protected regions. Cryo insulation slows ' +
            'the drift and expands where the ship can survive.',
          tone: 'warning',
        },
        {
          label: 'IMPACT',
          title: 'Relative velocity decides the repair bill',
          body:
            'Docking, station approaches, and planet passes all punish high closing speed. Use yaw ' +
            'to line up, then brake or thrust before contact.',
          tone: 'danger',
        },
      ],
      note:
        'If fuel and charge are gone together, the emergency beacon is only a request. Vale does ' +
        'not recommend making rescue your flight plan.',
    },
    {
      id: 'upgrades',
      navLabel: 'Upgrades',
      title: 'Engineering Bay Upgrades',
      subtitle: 'Purchased tiers improve the shuttle coefficients that matter in flight.',
      readouts: [
        {
          label: 'Installed',
          value: String(installedUpgradeLabels.value.length),
          caption: installedUpgradeLabels.value.length === 1 ? 'package active' : 'packages active',
        },
        {
          label: 'Access',
          value: props.dockedPlanet ? 'Docked' : 'Undocked',
          caption: 'Engineering work is performed through station and spaceport services.',
        },
      ],
      cards: [
        {
          label: 'PROPULSION',
          title: 'Thrust, charge, and efficiency',
          body:
            'Thruster upgrades improve fuel efficiency, capacitor recharge, and practical shuttle ' +
            'speed during burns and corrections.',
          tone: 'safe',
        },
        {
          label: 'RANGE',
          title: 'Fuel and systems endurance',
          body:
            'Tank expansion and efficient systems extend routes by increasing reserve capacity and ' +
            'reducing passive fuel losses.',
          tone: 'neutral',
        },
        {
          label: 'SURVIVAL',
          title: 'Hull and thermal protection',
          body:
            'Hull plating, heat shielding, cryo insulation, and radiation shielding widen the ' +
            'operating envelope near dangerous bodies.',
          tone: 'warning',
        },
        {
          label: 'NAVIGATION',
          title: 'Slingshot coupling',
          body:
            'Slingshot upgrades increase burst strength and settled cruise speed after a clean ' +
            'gravity release.',
          tone: 'safe',
        },
      ],
      note: installedUpgradeNote.value,
      showUpgradeAction: true,
    },
    {
      id: 'certificate',
      navLabel: 'Certificate',
      title: 'Certificate Of Ownership',
      subtitle: 'Vale Orbital Refurb transfer record and vessel provenance.',
      certificate: {
        seal: 'Vale Orbital Refurb // 2306-04-05 // Registered Transfer',
        title: 'Certificate Of Ownership',
        ownerName: props.playerName || 'UNREGISTERED PILOT',
        body:
          'Be it known that on this day I, Marta Vale of Vale Orbital Refurb, do hereby ' +
          'transfer all right, title, and interest in one (1) refurbished NASA-era lunar ' +
          'lander chassis (serial print-refurb #LM-7-Δ-8841), together with all aftermarket ' +
          'neutron thrusters, slingshot coupling, and charge management systems, to:',
        finePrint:
          'This vessel began as a 3D-printed copy of an old NASA design. It has since been ' +
          'heavily modified by people who needed it to keep flying. The frame is original. ' +
          'The soul is ours. She is paid off. She is yours now.',
        signatureName: 'Marta Vale',
        signatureTitle: 'Chief Engineer, Vale Orbital Refurb',
        quote: "She's yours now, handsome. Don't break her.",
      },
      note: 'This certificate is part of the shuttle record and must remain available from the terminal.',
    },
  ],
}))
</script>

<template>
  <TutorialProgramManual :manual="manual" @switch-to-upgrades="$emit('switch-to-upgrades')" />
</template>

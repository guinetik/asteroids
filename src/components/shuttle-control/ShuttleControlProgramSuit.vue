<script setup lang="ts">
import { computed } from 'vue'
import playerConfig from '@/data/fps/player-config.json'
import { UPGRADE_DEFINITIONS, type UpgradeId } from '@/lib/upgrades'
import TutorialProgramManual from './TutorialProgramManual.vue'
import type { TutorialProgramBadge, TutorialProgramManualModel } from './tutorialProgramTypes'

const NO_SUIT_UPGRADES_INSTALLED =
  'Installed suit packages: none. Visit the Engineering Bay at a station or spaceport.'

const props = defineProps<{
  upgradeLevels?: Partial<Record<UpgradeId, number>>
  dockedPlanet?: string | null
}>()

defineEmits<{
  'switch-to-upgrades': []
}>()

const isKnownSuitUpgradeId = (id: string): id is UpgradeId =>
  id.startsWith('suit') && Object.hasOwn(UPGRADE_DEFINITIONS, id)

const headerBadges = computed<readonly TutorialProgramBadge[]>(() => {
  const badges: TutorialProgramBadge[] = [
    {
      label: 'Class',
      value: 'EVA Suit',
    },
    {
      label: 'Base O2',
      value: `${playerConfig.o2.fuelCapacity} stock`,
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

const installedSuitUpgrades = computed(() => {
  if (!props.upgradeLevels) return []

  const installed: string[] = []
  for (const [id, level] of Object.entries(props.upgradeLevels)) {
    const resolvedLevel = level ?? 0
    if (!isKnownSuitUpgradeId(id) || resolvedLevel <= 0) continue

    const definition = UPGRADE_DEFINITIONS[id]
    installed.push(`${definition.label} (${id}) MK.${resolvedLevel}`)
  }

  return installed
})

const installedUpgradeNote = computed(() => {
  if (installedSuitUpgrades.value.length === 0) return NO_SUIT_UPGRADES_INSTALLED

  return `Installed suit packages: ${installedSuitUpgrades.value.join(', ')}.`
})

const manual = computed<TutorialProgramManualModel>(() => ({
  issuer: 'Vale Orbital Refurb / Contractor Life Support',
  title: 'EVA Suit Operations Manual',
  documentCode: 'VOR-SUIT-EVA-OPS-1.0',
  accent: 'suit',
  badges: headerBadges.value,
  chapters: [
    {
      id: 'summary',
      navLabel: 'Summary',
      title: 'Suit Operations Summary',
      subtitle: 'Standard contractor life-support and mobility procedures for surface and space EVA.',
      readouts: [
        {
          label: 'Primary reserve',
          value: 'O2',
          caption: 'Breathing reserve also feeds stamina recovery in asteroid EVA.',
        },
        {
          label: 'Space EVA entry',
          value: 'V',
          caption: 'Vehicle must be nearly stopped before egress is offered.',
        },
      ],
      cards: [
        {
          label: 'ASTEROID EVA',
          title: 'Surface suit mode',
          body:
            'On asteroid missions, the suit works with gravity boots, sprint stamina, jump ' +
            'thrusters, and the multitool. Movement is grounded until terrain, jump, hover, or ' +
            'knockback breaks boot contact.',
          tone: 'safe',
        },
        {
          label: 'SPACE EVA',
          title: 'Tethered service mode',
          body:
            'On the solar map, EVA freezes the shuttle, scales the worksite for first-person ' +
            'service, attaches a tether, and lets the suit maneuver around stations, relays, ' +
            'telescopes, satellites, and the hull.',
          tone: 'neutral',
        },
        {
          label: 'LIFE SUPPORT',
          title: 'No reserve, no forgiveness',
          body:
            'O2 drains continuously. When the tank is empty, hypoxia damages the operator until ' +
            'death or recovery.',
          tone: 'danger',
        },
      ],
    },
    {
      id: 'asteroid-eva',
      navLabel: 'Asteroid EVA',
      title: 'Asteroid Surface EVA',
      subtitle: 'Gravity boots, sprint charge, jump thrust, and multitool work on uneven terrain.',
      readouts: [
        {
          label: 'Walk',
          value: 'W / A / S / D',
          caption: 'Directional movement follows the FPS camera heading.',
        },
        {
          label: 'Sprint',
          value: 'Shift',
          caption: 'Consumes sprint charge and locks out until released and refilled after depletion.',
        },
        {
          label: 'Jump / hover',
          value: 'Space',
          caption: 'Jump uses suit charge; hover uses RTG when the multitool power source is wired in.',
        },
      ],
      cards: [
        {
          label: 'BOOTS',
          title: 'Gravity boots hold contact',
          body:
            'When moving on walkable support, the boots snap across small gaps and keep footing ' +
            'stable. Jumping, hover thrust, knockback, or upward velocity breaks boot contact.',
          tone: 'safe',
        },
        {
          label: 'STAMINA',
          title: 'Sprint is a charge bar',
          body:
            'Sprint spends suit charge while grounded and moving. If the bar bottoms out, release ' +
            'Shift and wait for a full refill before sprinting again.',
          tone: 'warning',
        },
        {
          label: 'HOVER',
          title: 'Air control costs power',
          body:
            'Holding jump while airborne applies hover thrust. In current asteroid field work, ' +
            'hover draws from multitool RTG rather than breathable O2 when that source is active.',
          tone: 'neutral',
        },
      ],
    },
    {
      id: 'space-eva',
      navLabel: 'Space EVA',
      title: 'Space EVA And Service Sites',
      subtitle: 'Exit only when the shuttle is stopped, then use suit RCS and prompts to work the site.',
      readouts: [
        {
          label: 'Entry prompt',
          value: 'EVA [V]',
          caption: 'Shown when the shuttle is slow enough and EVA is allowed.',
        },
        {
          label: 'Overspeed prompt',
          value: 'STOP SHIP TO EVA',
          caption: 'Shown at a mission site when the shuttle is moving too fast.',
        },
        {
          label: 'Return prompt',
          value: 'Return [V]',
          caption: 'Shown near the shuttle hull or return bounds.',
        },
      ],
      cards: [
        {
          label: 'EGRESS',
          title: 'Stop before leaving',
          body:
            'The suit will not deploy while the shuttle is moving too fast. Stop near the worksite, ' +
            'open the bay, and wait for the EVA handoff.',
          tone: 'warning',
        },
        {
          label: 'RCS',
          title: 'Six-axis suit jets',
          body:
            'Use W/A/S/D for forward/back/strafe, Space for up, and Shift for down. RCS audio and ' +
            'movement require available suit RTG.',
          tone: 'safe',
        },
        {
          label: 'WORKSITE',
          title: 'Maintenance starts from proximity',
          body:
            'Near compatible POIs, the suit shows maintenance prompts. Overlay minigames release ' +
            'pointer lock; in-scene satellite servicing keeps pointer lock and uses interact prompts.',
          tone: 'neutral',
        },
      ],
    },
    {
      id: 'life-support',
      navLabel: 'Life Support',
      title: 'O2, HP, And Hypoxia',
      subtitle: 'The suit has separate survival and mobility budgets, but O2 is always the clock.',
      readouts: [
        {
          label: 'Base O2 tank',
          value: String(playerConfig.o2.fuelCapacity),
          caption: 'Stock reserve before O2 capacity upgrades.',
        },
        {
          label: 'Base drain',
          value: `${playerConfig.o2.baseDrainRate}/s`,
          caption: 'Passive breathing drain while active in suit mode.',
        },
        {
          label: 'Hypoxia damage',
          value: `${playerConfig.health.hypoxiaDamagePerSecond}/s`,
          caption: 'HP loss after O2 reaches zero.',
        },
      ],
      cards: [
        {
          label: 'O2',
          title: 'Oxygen drains continuously',
          body:
            'Even calm suit work consumes O2. Sprinting and charge recovery affect suit endurance, ' +
            'but the tank is still your hard mission timer.',
          tone: 'warning',
        },
        {
          label: 'HP',
          title: 'Armor does not make air',
          body:
            'Suit armor raises survivability, but an empty O2 tank still causes hypoxia damage ' +
            'until the operator dies.',
          tone: 'danger',
        },
        {
          label: 'HUD',
          title: 'Warnings align with audio',
          body:
            'The FPS HUD warns at low O2 and hard breathing takes over at zero. Treat those cues as ' +
            'return-to-vehicle orders.',
          tone: 'safe',
        },
      ],
    },
    {
      id: 'upgrades',
      navLabel: 'Upgrades',
      title: 'Suit Upgrade Effects',
      subtitle: 'Engineering Bay suit tiers improve survivability, endurance, and field mobility.',
      readouts: [
        {
          label: 'Installed',
          value: String(installedSuitUpgrades.value.length),
          caption:
            installedSuitUpgrades.value.length === 1
              ? 'suit package active'
              : 'suit packages active',
        },
        {
          label: 'Service access',
          value: props.dockedPlanet ? 'Docked' : 'Undocked',
          caption: 'Upgrade work is performed through station or spaceport engineering services.',
        },
      ],
      cards: [
        {
          label: 'ARMOR',
          title: 'More HP',
          body: 'Suit armor increases maximum health for contact damage, combat, and hypoxia margin.',
          tone: 'safe',
        },
        {
          label: 'MOBILITY',
          title: 'Faster movement and stronger jumps',
          body:
            'Mobility tiers improve walking speed, sprint speed, and jump force for surface EVA.',
          tone: 'neutral',
        },
        {
          label: 'O2',
          title: 'Longer suit clock',
          body: 'O2 capacity upgrades extend the baseline time before low-air and hypoxia events.',
          tone: 'warning',
        },
        {
          label: 'STAMINA',
          title: 'Better sprint and jump uptime',
          body:
            'Stamina capacity and efficiency upgrades improve sprint/jump charge and reduce the ' +
            'cost of keeping those bars useful.',
          tone: 'safe',
        },
      ],
      note: installedUpgradeNote.value,
      showUpgradeAction: true,
    },
    {
      id: 'protocol',
      navLabel: 'Protocol',
      title: 'EVA Field Protocol',
      subtitle: 'Standard checks before leaving the vehicle or stepping away from the lander.',
      checklist: [
        {
          title: 'Stop the vehicle before space EVA',
          body: 'If the terminal says STOP SHIP TO EVA, kill speed before pressing V again.',
        },
        {
          title: 'Track the return prompt',
          body: 'Use Return to Shuttle [V] near the hull; do not drift away on a nearly empty tank.',
        },
        {
          title: 'Separate asteroid work from space work',
          body:
            'Asteroid EVA is surface movement and multitool labor. Space EVA is tethered servicing ' +
            'around the shuttle and mission POIs.',
        },
        {
          title: 'Respect low O2',
          body: 'Low oxygen is not flavor. Return, finish the minigame, or accept hypoxia damage.',
        },
      ],
    },
  ],
}))
</script>

<template>
  <TutorialProgramManual :manual="manual" @switch-to-upgrades="$emit('switch-to-upgrades')" />
</template>

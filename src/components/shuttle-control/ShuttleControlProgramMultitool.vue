<script setup lang="ts">
import { computed } from 'vue'
import multitoolConfig from '@/data/fps/multitool-config.json'
import { UPGRADE_DEFINITIONS, type UpgradeId } from '@/lib/upgrades'
import TutorialProgramManual from './TutorialProgramManual.vue'
import type { TutorialProgramBadge, TutorialProgramManualModel } from './tutorialProgramTypes'

const NO_MULTITOOL_UPGRADES_INSTALLED =
  'Installed multitool packages: none. Visit the Engineering Bay at a station or spaceport.'

const props = defineProps<{
  upgradeLevels?: Partial<Record<UpgradeId, number>>
  dockedPlanet?: string | null
}>()

defineEmits<{
  'switch-to-upgrades': []
}>()

const isKnownMultitoolUpgradeId = (id: string): id is UpgradeId =>
  id.startsWith('multitool') && Object.hasOwn(UPGRADE_DEFINITIONS, id)

const headerBadges = computed<readonly TutorialProgramBadge[]>(() => {
  const badges: TutorialProgramBadge[] = [
    {
      label: 'Class',
      value: 'Field Kit',
    },
    {
      label: 'Base RTG',
      value: `${multitoolConfig.rtg.fuelCapacity} stock`,
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

const installedMultitoolUpgrades = computed(() => {
  if (!props.upgradeLevels) return []

  const installed: string[] = []

  for (const [id, level] of Object.entries(props.upgradeLevels)) {
    const resolvedLevel = level ?? 0
    if (!isKnownMultitoolUpgradeId(id) || resolvedLevel <= 0) continue

    const definition = UPGRADE_DEFINITIONS[id]
    installed.push(`${definition.label} (${id}) MK.${resolvedLevel}`)
  }

  return installed
})

const installedUpgradeNote = computed(() => {
  if (installedMultitoolUpgrades.value.length === 0) return NO_MULTITOOL_UPGRADES_INSTALLED

  return `Installed multitool packages: ${installedMultitoolUpgrades.value.join(', ')}.`
})

const manual = computed<TutorialProgramManualModel>(() => ({
  issuer: 'Martian Marine Corps',
  title: 'Standard Field Multitool Manual',
  documentCode: 'MMC-FIELD-MT-RTG-1.2',
  accent: 'mmc',
  badges: headerBadges.value,
  chapters: [
    {
      id: 'summary',
      navLabel: 'Summary',
      title: 'Standard Field Multitool Summary',
      subtitle: 'Issued close-support kit for mining, cutting, combat, and field science.',
      readouts: [
        {
          label: 'Modes',
          value: 'DRL / LAS / SCI',
          caption: 'Select drill, laser, or science mode before aiming.',
        },
        {
          label: 'Fire rule',
          value: 'ADS required',
          caption: 'Right mouse aim-down-sights arms the selected tool head.',
        },
      ],
      cards: [
        {
          label: 'DRL',
          title: 'Drill and mining mode',
          body:
            'DRL is the high-torque mining head. Use it on ore, rock faces, and close utility ' +
            'work where steady contact matters more than burst damage.',
          tone: 'safe',
        },
        {
          label: 'LAS',
          title: 'Laser weapon mode',
          body:
            'LAS fires automatic bolts for surface defense and precision cutting. Keep the beam ' +
            'on target and watch charge recovery between bursts.',
          tone: 'warning',
        },
        {
          label: 'SCI',
          title: 'Science scanner mode',
          body:
            'SCI fires deliberate scanner shots for prospecting, survey objectives, and contextual ' +
            'science interactions. It rewards accurate clicks instead of spray fire.',
          tone: 'neutral',
        },
      ],
    },
    {
      id: 'controls',
      navLabel: 'Controls',
      title: 'Mode Selection And Fire Discipline',
      subtitle: 'Select mode, aim down sights, then fire.',
      cards: [
        {
          label: 'DIGIT 1',
          title: 'Select DRL',
          body:
            'Press Digit 1 to bring up the drill head. Hold left mouse while aiming to mine, then ' +
            'release before the charge bottoms out.',
          tone: 'safe',
        },
        {
          label: 'DIGIT 2',
          title: 'Select LAS',
          body:
            'Press Digit 2 for laser mode. Holding left mouse while ADS is active produces ' +
            'automatic bolt fire at the weapon cadence.',
          tone: 'warning',
        },
        {
          label: 'DIGIT 3',
          title: 'Select SCI',
          body:
            'Press Digit 3 for the science scanner. Each left mouse click while aimed fires one ' +
            'scanner shot, so line up the scan before spending charge.',
          tone: 'neutral',
        },
        {
          label: 'ADS',
          title: 'Right mouse is the arming gate',
          body:
            'The multitool does not fire from the hip. Hold right mouse to aim down sights, then ' +
            'use left mouse for the selected mode behavior.',
          tone: 'danger',
        },
      ],
    },
    {
      id: 'rtg',
      navLabel: 'RTG',
      title: 'RTG Shared Pool And Charge Bars',
      subtitle: 'One RTG reserve feeds separate mode capacitors.',
      readouts: [
        {
          label: 'Base RTG pool',
          value: String(multitoolConfig.rtg.fuelCapacity),
          caption: 'Stock shared reserve before any RTG capacity upgrades are applied.',
        },
        {
          label: 'Base RTG burst',
          value: `${multitoolConfig.rtg.burstAmount} reserve`,
          caption:
            `${multitoolConfig.rtg.burstMin}-${multitoolConfig.rtg.burstMax}s timing window ` +
            'for restoring fuel to the shared RTG pool.',
        },
        {
          label: 'Base SCI burn',
          value: `${multitoolConfig.rtg.thrusters.science.burnRate}/s`,
          caption: 'Stock science burn rate before efficiency upgrades are applied.',
        },
      ],
      cards: [
        {
          label: 'POOL',
          title: 'All modes share the RTG reserve',
          body:
            'DRL, LAS, and SCI each have their own charge bar, but every recharge draws from the ' +
            'same RTG pool. Empty reserve means no automatic recovery.',
          tone: 'warning',
        },
        {
          label: 'CHARGE',
          title: 'Mode capacitors recover while idle',
          body:
            'A mode that is not firing can rebuild charge from the RTG reserve. Full bars do not ' +
            'spend RTG, but every recovered charge unit has a cost.',
          tone: 'neutral',
        },
        {
          label: 'BURST',
          title: 'RTG bursts recover the shared pool',
          body:
            'Use burst recharge to restore a small amount of RTG reserve in the field. It keeps ' +
            'a fight or mining pass alive, but it still belongs to the shared pool budget.',
          tone: 'safe',
        },
      ],
    },
    {
      id: 'behavior',
      navLabel: 'Behavior',
      title: 'Mode Behavior And Lockout Rules',
      subtitle: 'Each head has a different trigger model and failure mode.',
      cards: [
        {
          label: 'DRL',
          title: 'Feather the drill',
          body:
            'The drill is most efficient when pulsed against the target. Holding it until the bar ' +
            'bottoms out causes recovery lockout, so release early and let charge return.',
          tone: 'danger',
        },
        {
          label: 'LAS',
          title: 'Automatic weapon fire',
          body:
            'LAS continues firing while left mouse is held and ADS remains active. Track targets in ' +
            'short bursts so the weapon capacitor has time to recover.',
          tone: 'warning',
        },
        {
          label: 'SCI',
          title: 'Click-shot scanner',
          body:
            'SCI fires one scan per click. Use it on survey targets, ore prospects, terminals, and ' +
            'science prompts when the reticle is stable.',
          tone: 'safe',
        },
      ],
      note: 'MMC field doctrine treats missed shots as power leaks. Aim first, then spend the charge.',
    },
    {
      id: 'upgrades',
      navLabel: 'Upgrades',
      title: 'Multitool Upgrade Effects',
      subtitle: 'Engineering Bay tiers improve output, endurance, and science yield.',
      readouts: [
        {
          label: 'Installed',
          value: String(installedMultitoolUpgrades.value.length),
          caption:
            installedMultitoolUpgrades.value.length === 1
              ? 'multitool package active'
              : 'multitool packages active',
        },
        {
          label: 'Service access',
          value: props.dockedPlanet ? 'Docked' : 'Undocked',
          caption: 'Upgrade work is performed through station or spaceport engineering services.',
        },
      ],
      cards: [
        {
          label: 'EFFICIENCY',
          title: 'Longer work before depletion',
          body:
            'Efficiency upgrades reduce how hard the tool has to spend charge for field work, ' +
            'giving mining, cutting, and scanning more usable time per RTG reserve.',
          tone: 'safe',
        },
        {
          label: 'DAMAGE',
          title: 'Higher output per shot',
          body:
            'Damage upgrades improve drill bite and laser threat response. They do not replace aim ' +
            'discipline or charge management.',
          tone: 'warning',
        },
        {
          label: 'RTG',
          title: 'Capacity and recharge',
          body:
            'RTG capacity and RTG charge upgrades expand the shared pool and improve recovery, ' +
            'which keeps all three modes available deeper into a sortie.',
          tone: 'neutral',
        },
        {
          label: 'SCIENCE',
          title: 'Survey reward multiplier',
          body:
            'Science upgrades increase the value of correct survey and prospecting work. Use SCI ' +
            'shots deliberately to convert field reads into better mission returns.',
          tone: 'safe',
        },
      ],
      note: installedUpgradeNote.value,
      showUpgradeAction: true,
    },
    {
      id: 'protocol',
      navLabel: 'Protocol',
      title: 'Field Protocol',
      subtitle: 'Standard order for safe surface multitool work.',
      checklist: [
        {
          title: 'Confirm the head',
          body: 'Check DRL, LAS, or SCI before aiming. Digit 1 mines, Digit 2 fights, and Digit 3 scans.',
        },
        {
          title: 'Aim before firing',
          body:
            'Hold right mouse to ADS and verify the reticle is on the intended target before using ' +
            'left mouse.',
        },
        {
          title: 'Protect the RTG reserve',
          body:
            'Watch the shared RTG pool and the selected mode charge bar. Recharge spends the pool, ' +
            'and no reserve means no recovery.',
        },
        {
          title: 'Feather continuous tools',
          body:
            'Pulse the drill and burst the laser instead of draining the bar flat. Bottomed-out ' +
            'drill charge creates lockout and removes your fastest mining option.',
        },
        {
          title: 'Spend SCI shots with intent',
          body:
            'Science mode is a click-shot instrument. Use it for prospecting, surveys, and ' +
            'contextual science targets when a clean hit matters.',
        },
      ],
    },
  ],
}))
</script>

<template>
  <TutorialProgramManual :manual="manual" @switch-to-upgrades="$emit('switch-to-upgrades')" />
</template>

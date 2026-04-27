/**
 * Shared content model for shuttle terminal tutorial programs.
 *
 * @author guinetik
 * @date 2026-04-27
 * @spec docs/superpowers/specs/2026-04-27-tutorial-programs-redesign-design.md
 */

/** Issuer accent theme used by the shared tutorial program manual shell. */
export type TutorialProgramAccent = 'vale' | 'jovian' | 'mmc' | 'suit'

/** Compact metadata pill shown in a tutorial program header. */
export interface TutorialProgramBadge {
  /** Label text for the badge, such as `"Fuel"` or `"Issuer"`. */
  readonly label: string
  /** Value text shown beside the badge label, such as `"82%"` or `"Vale"`. */
  readonly value: string
  /** True when the badge should use warning styling for urgent or degraded status. */
  readonly warning?: boolean
}

/** Diagnostic card rendered inside a tutorial program chapter. */
export interface TutorialProgramCard {
  /** Card heading shown above the body copy, such as `"Main Engine"`. */
  readonly title: string
  /** Player-facing instructional body copy for the card. */
  readonly body: string
  /** Optional eyebrow label for grouping card content, such as `"CONTROL"`. */
  readonly label?: string
  /** Visual severity used by the card, from neutral guidance to danger warnings. */
  readonly tone?: 'neutral' | 'safe' | 'warning' | 'danger'
}

/** Short value readout displayed in a chapter diagnostics strip. */
export interface TutorialProgramReadout {
  /** Readout label shown above or beside the value, such as `"Hull"`. */
  readonly label: string
  /** Primary readout value, such as `"Nominal"` or `"3 Installed"`. */
  readonly value: string
  /** Optional explanatory caption shown under the value. */
  readonly caption?: string
}

/** One checklist row in a field procedure chapter. */
export interface TutorialProgramChecklistItem {
  /** Checklist item title, such as `"Confirm Surface Slope"`. */
  readonly title: string
  /** Checklist instruction body explaining the action or verification. */
  readonly body: string
}

/** Certificate-style legal/provenance document rendered inside a manual chapter. */
export interface TutorialProgramCertificate {
  /** Small seal or registry line shown above the certificate title. */
  readonly seal: string
  /** Certificate title, such as `"Certificate Of Ownership"`. */
  readonly title: string
  /** Registered owner or recipient name rendered prominently. */
  readonly ownerName: string
  /** Main certificate body copy explaining the transfer or provenance. */
  readonly body: string
  /** Secondary fine-print copy shown below the registered owner. */
  readonly finePrint: string
  /** Signature name shown in the certificate footer. */
  readonly signatureName: string
  /** Signature title or issuing authority. */
  readonly signatureTitle: string
  /** Optional short issuer quote shown beside the signature. */
  readonly quote?: string
}

/** One navigable chapter in a tutorial program manual. */
export interface TutorialProgramChapter {
  /** Stable chapter id used for rendering keys and future deep links. */
  readonly id: string
  /** Short chapter label shown in the chapter rail, such as `"Power"`. */
  readonly navLabel: string
  /** Full chapter title shown in the content panel. */
  readonly title: string
  /** Optional supporting subtitle shown under the chapter title. */
  readonly subtitle?: string
  /** Optional diagnostic cards that make up the chapter's main instructional content. */
  readonly cards?: readonly TutorialProgramCard[]
  /** Optional readout values rendered as a compact diagnostics strip. */
  readonly readouts?: readonly TutorialProgramReadout[]
  /** Optional note or issuer callout rendered below the chapter content. */
  readonly note?: string
  /** Optional field checklist rendered as ordered operational guidance. */
  readonly checklist?: readonly TutorialProgramChecklistItem[]
  /** Optional certificate/provenance document rendered as the chapter body. */
  readonly certificate?: TutorialProgramCertificate
  /** True when the chapter should expose the parent-provided upgrade navigation action. */
  readonly showUpgradeAction?: boolean
}

/** Complete content model consumed by the shared tutorial program manual shell. */
export interface TutorialProgramManualModel {
  /** Issuing organization displayed in the program header. */
  readonly issuer: string
  /** Manual title displayed as the program's primary heading. */
  readonly title: string
  /** Document or revision code displayed with the issuer metadata. */
  readonly documentCode: string
  /** Accent theme that maps the issuer to shared terminal styling. */
  readonly accent: TutorialProgramAccent
  /** Header badges for live telemetry, equipment class, or contextual metadata. */
  readonly badges: readonly TutorialProgramBadge[]
  /** Ordered chapters available in the chapter rail and footer navigation. */
  readonly chapters: readonly TutorialProgramChapter[]
}

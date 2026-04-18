/**
 * Voyager-style relay satellite prop — parabolic high-gain dish on a decagonal
 * bus with an RTG boom, science boom, magnetometer whip, golden record, and a
 * blinking comms light. Built entirely from primitive geometries.
 *
 * @author guinetik
 * @date 2026-04-18
 * @spec docs/asteroid-lander-gdd.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'

const BUS_RADIUS = 1.1
const BUS_HEIGHT = 0.9
const BUS_RADIAL_SEGMENTS = 10

const DISH_RADIUS = 3.2
const DISH_THETA_LENGTH = Math.PI / 2.6
const DISH_BACK_OFFSET = 0.35
const DISH_FEED_HORN_HEIGHT = 0.7
const DISH_FEED_HORN_RADIUS = 0.18
const DISH_STRUT_COUNT = 3
const DISH_STRUT_RADIUS = 0.04
const DISH_MOUNT_HEIGHT = 0.5

const RTG_BOOM_LENGTH = 3.6
const RTG_BOOM_RADIUS = 0.08
const RTG_UNIT_COUNT = 3
const RTG_UNIT_RADIUS = 0.32
const RTG_UNIT_HEIGHT = 0.55
const RTG_UNIT_SPACING = 0.65

const SCIENCE_BOOM_LENGTH = 3.0
const SCIENCE_BOOM_RADIUS = 0.06
const SCIENCE_INSTRUMENT_SIZE = 0.45

const MAGNETOMETER_LENGTH = 7.5
const MAGNETOMETER_RADIUS = 0.03

const GOLDEN_RECORD_RADIUS = 0.35
const GOLDEN_RECORD_THICKNESS = 0.04

const COMMS_LIGHT_RADIUS = 0.12
const COMMS_LIGHT_BASE_INTENSITY = 0.6
const COMMS_LIGHT_PEAK_INTENSITY = 4
const COMMS_LIGHT_DISTANCE = 18
const COMMS_LIGHT_DECAY = 1.8
const COMMS_BLINK_HZ = 0.55

const DISH_YAW_AMPLITUDE_RAD = 0.25
const DISH_YAW_HZ = 0.08

const BUS_COLOR = 0xc8ccd2
const DISH_BACK_COLOR = 0xdde1e6
const DISH_INNER_COLOR = 0xf2f4f7
const RTG_COLOR = 0x2a2826
const BOOM_COLOR = 0x9aa0a8
const INSTRUMENT_COLOR = 0x2b2e33
const GOLD_COLOR = 0xd4a437
const COMMS_COLOR = 0xff4d4d

const BUS_METALNESS = 0.94
const BUS_ROUGHNESS = 0.18
const DISH_BACK_METALNESS = 0.88
const DISH_BACK_ROUGHNESS = 0.18
const DISH_INNER_METALNESS = 0.98
const DISH_INNER_ROUGHNESS = 0.08
const BOOM_METALNESS = 0.9
const BOOM_ROUGHNESS = 0.22
const STRUT_METALNESS = 0.92
const STRUT_ROUGHNESS = 0.18
const HORN_METALNESS = 0.95
const HORN_ROUGHNESS = 0.12

/**
 * Voyager-like communications relay satellite constructed from primitives.
 *
 * Exposes a {@link group} root for scene insertion and implements {@link Tickable}
 * so the shuttle scene can register it with the tick handler for dish tracking
 * and the blinking comms beacon.
 */
export class RelayAntennaController implements Tickable {
  readonly group = new THREE.Group()
  private readonly modelRoot = new THREE.Group()
  private readonly dishPivot = new THREE.Group()
  private readonly commsLight: THREE.PointLight
  private readonly commsMaterial: THREE.MeshStandardMaterial
  private readonly disposables: { dispose(): void }[] = []
  private elapsed = 0

  constructor() {
    this.modelRoot.rotation.x = -Math.PI / 2
    this.group.add(this.modelRoot)
    this.modelRoot.add(this.dishPivot)

    this.buildBus()
    this.commsMaterial = new THREE.MeshStandardMaterial({
      color: COMMS_COLOR,
      emissive: COMMS_COLOR,
      emissiveIntensity: 1.5,
    })
    this.disposables.push(this.commsMaterial)

    this.buildDish()
    this.buildBooms()
    this.buildGoldenRecord()
    this.commsLight = this.buildCommsLight()
  }

  private track<T extends THREE.BufferGeometry | THREE.Material>(resource: T): T {
    this.disposables.push(resource)
    return resource
  }

  private buildBus(): void {
    const busMat = this.track(
      new THREE.MeshStandardMaterial({
        color: BUS_COLOR,
        metalness: BUS_METALNESS,
        roughness: BUS_ROUGHNESS,
      }),
    )
    const bus = new THREE.Mesh(
      this.track(
        new THREE.CylinderGeometry(BUS_RADIUS, BUS_RADIUS, BUS_HEIGHT, BUS_RADIAL_SEGMENTS),
      ),
      busMat,
    )
    bus.castShadow = true
    bus.receiveShadow = true
    this.modelRoot.add(bus)

    const capGeom = this.track(
      new THREE.CylinderGeometry(
        BUS_RADIUS * 0.95,
        BUS_RADIUS * 0.95,
        0.08,
        BUS_RADIAL_SEGMENTS,
      ),
    )
    const topCap = new THREE.Mesh(capGeom, busMat)
    topCap.position.y = BUS_HEIGHT * 0.5 + 0.04
    topCap.castShadow = true
    this.modelRoot.add(topCap)

    const bottomCap = new THREE.Mesh(capGeom, busMat)
    bottomCap.position.y = -BUS_HEIGHT * 0.5 - 0.04
    bottomCap.castShadow = true
    this.modelRoot.add(bottomCap)
  }

  private buildDish(): void {
    this.dishPivot.position.y = BUS_HEIGHT * 0.5 + DISH_MOUNT_HEIGHT

    const backMat = this.track(
      new THREE.MeshStandardMaterial({
        color: DISH_BACK_COLOR,
        metalness: DISH_BACK_METALNESS,
        roughness: DISH_BACK_ROUGHNESS,
        side: THREE.BackSide,
      }),
    )
    const innerMat = this.track(
      new THREE.MeshStandardMaterial({
        color: DISH_INNER_COLOR,
        metalness: DISH_INNER_METALNESS,
        roughness: DISH_INNER_ROUGHNESS,
        side: THREE.FrontSide,
      }),
    )
    const bowlGeom = this.track(
      new THREE.SphereGeometry(DISH_RADIUS, 48, 24, 0, Math.PI * 2, 0, DISH_THETA_LENGTH),
    )
    const bowlInner = new THREE.Mesh(bowlGeom, innerMat)
    const bowlBack = new THREE.Mesh(bowlGeom, backMat)
    bowlInner.castShadow = true
    bowlInner.receiveShadow = true
    bowlBack.castShadow = true

    bowlInner.rotation.x = Math.PI
    bowlBack.rotation.x = Math.PI
    bowlInner.position.y = DISH_BACK_OFFSET
    bowlBack.position.y = DISH_BACK_OFFSET
    this.dishPivot.add(bowlInner, bowlBack)

    const hornGeom = this.track(
      new THREE.ConeGeometry(DISH_FEED_HORN_RADIUS, DISH_FEED_HORN_HEIGHT, 18),
    )
    const hornMat = this.track(
      new THREE.MeshStandardMaterial({
        color: 0xb6bac2,
        metalness: HORN_METALNESS,
        roughness: HORN_ROUGHNESS,
      }),
    )
    const horn = new THREE.Mesh(hornGeom, hornMat)
    horn.rotation.x = Math.PI
    horn.position.y = DISH_BACK_OFFSET - DISH_RADIUS * 0.55
    horn.castShadow = true
    this.dishPivot.add(horn)

    const strutGeom = this.track(
      new THREE.CylinderGeometry(
        DISH_STRUT_RADIUS,
        DISH_STRUT_RADIUS,
        DISH_RADIUS * 0.95,
        6,
      ),
    )
    const strutMat = this.track(
      new THREE.MeshStandardMaterial({
        color: BOOM_COLOR,
        metalness: STRUT_METALNESS,
        roughness: STRUT_ROUGHNESS,
      }),
    )
    for (let i = 0; i < DISH_STRUT_COUNT; i++) {
      const strut = new THREE.Mesh(strutGeom, strutMat)
      const a = (i / DISH_STRUT_COUNT) * Math.PI * 2
      const rimR = DISH_RADIUS * 0.85
      strut.position.set(Math.cos(a) * rimR * 0.5, DISH_BACK_OFFSET - DISH_RADIUS * 0.45, Math.sin(a) * rimR * 0.5)
      strut.lookAt(Math.cos(a) * rimR, DISH_BACK_OFFSET, Math.sin(a) * rimR)
      strut.rotateX(Math.PI / 2)
      this.dishPivot.add(strut)
    }
  }

  private buildBooms(): void {
    const boomMat = this.track(
      new THREE.MeshStandardMaterial({
        color: BOOM_COLOR,
        metalness: BOOM_METALNESS,
        roughness: BOOM_ROUGHNESS,
      }),
    )

    const rtgBoomGeom = this.track(
      new THREE.CylinderGeometry(RTG_BOOM_RADIUS, RTG_BOOM_RADIUS, RTG_BOOM_LENGTH, 10),
    )
    const rtgBoom = new THREE.Mesh(rtgBoomGeom, boomMat)
    rtgBoom.rotation.z = Math.PI / 2
    rtgBoom.position.x = BUS_RADIUS + RTG_BOOM_LENGTH * 0.5
    rtgBoom.castShadow = true
    this.modelRoot.add(rtgBoom)

    const rtgMat = this.track(
      new THREE.MeshStandardMaterial({
        color: RTG_COLOR,
        metalness: 0.2,
        roughness: 0.85,
        emissive: 0x1a0e05,
        emissiveIntensity: 0.6,
      }),
    )
    const rtgGeom = this.track(
      new THREE.CylinderGeometry(RTG_UNIT_RADIUS, RTG_UNIT_RADIUS, RTG_UNIT_HEIGHT, 8),
    )
    const rtgClusterX = BUS_RADIUS + RTG_BOOM_LENGTH - RTG_UNIT_HEIGHT
    for (let i = 0; i < RTG_UNIT_COUNT; i++) {
      const rtg = new THREE.Mesh(rtgGeom, rtgMat)
      rtg.rotation.z = Math.PI / 2
      rtg.position.x = rtgClusterX - i * RTG_UNIT_SPACING
      rtg.castShadow = true
      this.modelRoot.add(rtg)
    }

    const sciBoomGeom = this.track(
      new THREE.CylinderGeometry(SCIENCE_BOOM_RADIUS, SCIENCE_BOOM_RADIUS, SCIENCE_BOOM_LENGTH, 8),
    )
    const sciBoom = new THREE.Mesh(sciBoomGeom, boomMat)
    sciBoom.rotation.z = Math.PI / 2
    sciBoom.position.x = -(BUS_RADIUS + SCIENCE_BOOM_LENGTH * 0.5)
    sciBoom.castShadow = true
    this.modelRoot.add(sciBoom)

    const instMat = this.track(
      new THREE.MeshStandardMaterial({ color: INSTRUMENT_COLOR, metalness: 0.5, roughness: 0.6 }),
    )
    const instGeom = this.track(
      new THREE.BoxGeometry(SCIENCE_INSTRUMENT_SIZE, SCIENCE_INSTRUMENT_SIZE, SCIENCE_INSTRUMENT_SIZE),
    )
    const inst1 = new THREE.Mesh(instGeom, instMat)
    inst1.position.set(-(BUS_RADIUS + SCIENCE_BOOM_LENGTH * 0.55), 0, 0.35)
    inst1.castShadow = true
    this.modelRoot.add(inst1)

    const inst2 = new THREE.Mesh(instGeom, instMat)
    inst2.position.set(-(BUS_RADIUS + SCIENCE_BOOM_LENGTH * 0.95), 0, -0.3)
    inst2.scale.set(1.2, 0.7, 0.8)
    inst2.castShadow = true
    this.modelRoot.add(inst2)

    const magGeom = this.track(
      new THREE.CylinderGeometry(MAGNETOMETER_RADIUS, MAGNETOMETER_RADIUS * 0.6, MAGNETOMETER_LENGTH, 6),
    )
    const mag = new THREE.Mesh(magGeom, boomMat)
    mag.position.set(0, 0, -(BUS_RADIUS + MAGNETOMETER_LENGTH * 0.5))
    mag.rotation.x = Math.PI / 2
    this.modelRoot.add(mag)
  }

  private buildGoldenRecord(): void {
    const goldMat = this.track(
      new THREE.MeshStandardMaterial({
        color: GOLD_COLOR,
        metalness: 0.95,
        roughness: 0.22,
        emissive: GOLD_COLOR,
        emissiveIntensity: 0.08,
      }),
    )
    const disc = new THREE.Mesh(
      this.track(
        new THREE.CylinderGeometry(GOLDEN_RECORD_RADIUS, GOLDEN_RECORD_RADIUS, GOLDEN_RECORD_THICKNESS, 28),
      ),
      goldMat,
    )
    disc.rotation.x = Math.PI / 2
    disc.position.set(0, 0, BUS_RADIUS + GOLDEN_RECORD_THICKNESS * 0.5)
    disc.castShadow = true
    this.modelRoot.add(disc)
  }

  private buildCommsLight(): THREE.PointLight {
    const bulb = new THREE.Mesh(
      this.track(new THREE.SphereGeometry(COMMS_LIGHT_RADIUS, 14, 10)),
      this.commsMaterial,
    )
    bulb.position.set(0, -BUS_HEIGHT * 0.5 - 0.18, BUS_RADIUS * 0.25)
    this.modelRoot.add(bulb)

    const light = new THREE.PointLight(
      COMMS_COLOR,
      COMMS_LIGHT_BASE_INTENSITY,
      COMMS_LIGHT_DISTANCE,
      COMMS_LIGHT_DECAY,
    )
    light.position.copy(bulb.position)
    this.modelRoot.add(light)
    return light
  }

  tick(dt: number): void {
    this.elapsed += dt

    this.dishPivot.rotation.y =
      Math.sin(this.elapsed * DISH_YAW_HZ * Math.PI * 2) * DISH_YAW_AMPLITUDE_RAD
    this.dishPivot.rotation.z =
      Math.cos(this.elapsed * DISH_YAW_HZ * Math.PI * 2 * 0.6) * DISH_YAW_AMPLITUDE_RAD * 0.35

    const blink = 0.5 + 0.5 * Math.sin(this.elapsed * COMMS_BLINK_HZ * Math.PI * 2)
    const pulse = blink * blink
    this.commsLight.intensity =
      COMMS_LIGHT_BASE_INTENSITY + (COMMS_LIGHT_PEAK_INTENSITY - COMMS_LIGHT_BASE_INTENSITY) * pulse
    this.commsMaterial.emissiveIntensity = 0.4 + pulse * 3.5
  }

  dispose(): void {
    this.commsLight.dispose()
    for (const d of this.disposables) d.dispose()
  }
}

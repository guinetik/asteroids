/**
 * Target dummy — a shooting range target for the FPS demo scene.
 *
 * Flat square with a target/bullseye pattern. Spawns at a world position
 * on the terrain, faces the player. Flashes on hit, falls over on death.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd-v03.md
 */
import * as THREE from 'three'
import type { Tickable } from '@/lib/Tickable'
import { Enemy } from '@/lib/fps/enemy'
import type { EnemyConfig } from '@/lib/fps/enemy'

const TARGET_SIZE = 3
const TARGET_HEIGHT = 4
const HIT_FLASH_DURATION = 0.1
const FALL_SPEED = 3

/** Default enemy config for target dummies. */
const DUMMY_CONFIG: EnemyConfig = {
  maxHp: 100,
  hitRadius: 2.5,
}

/**
 * Shooting range target dummy with bullseye pattern.
 *
 * @author guinetik
 * @date 2026-04-04
 * @spec docs/asteroid-lander-gdd-v03.md
 */
export class TargetDummyController implements Tickable {
  readonly group = new THREE.Group()
  readonly enemy: Enemy
  private readonly material: THREE.LineBasicMaterial
  private readonly baseColor = new THREE.Color(0xcccccc)
  private flashTimer = 0
  private dead = false
  private fallAngle = 0

  constructor(position: THREE.Vector3) {
    this.enemy = new Enemy(DUMMY_CONFIG)
    this.enemy.position.copy(position)
    this.enemy.position.y = position.y + TARGET_HEIGHT / 2

    // Target board — wireframe square (black edges, no fill)
    const boardGeo = new THREE.EdgesGeometry(
      new THREE.BoxGeometry(TARGET_SIZE, TARGET_HEIGHT, 0.05),
    )
    this.material = new THREE.LineBasicMaterial({ color: this.baseColor })
    const board = new THREE.LineSegments(boardGeo, this.material)
    this.group.add(board)

    // Bullseye rings — wireframe circles, alternating colors
    const ringColors = [0xff4444, 0xffaa00, 0xff4444, 0xffaa00, 0xff4444]
    const ringRadii = [1.2, 0.95, 0.7, 0.45, 0.2]
    for (let i = 0; i < ringRadii.length; i++) {
      const ringGeo = new THREE.EdgesGeometry(new THREE.CircleGeometry(ringRadii[i]!, 24))
      const ring = new THREE.LineSegments(
        ringGeo,
        new THREE.LineBasicMaterial({ color: ringColors[i]! }),
      )
      ring.position.z = 0.03
      ring.position.y = 0.3
      this.group.add(ring)
    }

    // Post — wireframe pole
    const postGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.1, TARGET_HEIGHT, 0.1))
    const post = new THREE.LineSegments(postGeo, new THREE.LineBasicMaterial({ color: 0x665544 }))
    post.position.y = -TARGET_HEIGHT / 2
    this.group.add(post)

    this.group.position.copy(position)

    // Sync enemy position with group
    this.enemy.onDeath = () => {
      this.dead = true
    }
  }

  /** Flash the target on hit. */
  flash(): void {
    this.flashTimer = HIT_FLASH_DURATION
    this.material.color.set(0xffff00)
  }

  tick(dt: number): void {
    // Hit flash
    if (this.flashTimer > 0) {
      this.flashTimer -= dt
      if (this.flashTimer <= 0) {
        this.material.color.copy(this.baseColor)
      }
    }

    // Death: fall over
    if (this.dead && this.fallAngle < Math.PI / 2) {
      this.fallAngle = Math.min(Math.PI / 2, this.fallAngle + FALL_SPEED * dt)
      this.group.rotation.x = this.fallAngle
    }

    // Sync enemy position
    this.enemy.position.copy(this.group.position)
    this.enemy.position.y = this.group.position.y + TARGET_HEIGHT / 2
  }

  dispose(): void {
    this.group.traverse((child) => {
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry.dispose()
        ;(child.material as THREE.Material).dispose()
      }
    })
  }
}

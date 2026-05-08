/**
 * Smoke spec for {@link SushiMetersOverlay} — verifies that the two
 * canvas donuts and their labels render when visible and that the
 * overlay disappears entirely when `visible` is false.
 *
 * @author guinetik
 * @date 2026-05-07
 * @spec docs/superpowers/specs/2026-05-07-sushi-cat-care-design.md
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { mount } from '@vue/test-utils'
import SushiMetersOverlay from '@/components/hud/SushiMetersOverlay.vue'

beforeAll(() => {
  // JSDOM doesn't implement getContext for <canvas>; provide a no-op stub
  // so the component's drawing code can run without throwing.
  if (!HTMLCanvasElement.prototype.getContext) {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: () => ({
        setTransform: () => {},
        clearRect: () => {},
        beginPath: () => {},
        arc: () => {},
        stroke: () => {},
        fillText: () => {},
        fillRect: () => {},
      }),
    })
  }
})

describe('SushiMetersOverlay', () => {
  it('renders all donut canvases and the LOVE / HUNGER / TIRED labels when visible', () => {
    const wrapper = mount(SushiMetersOverlay, {
      props: { visible: true, love: 75, hunger: 40, tired: 20 },
    })
    const canvases = wrapper.findAll('canvas')
    expect(canvases).toHaveLength(3)
    const html = wrapper.html()
    expect(html).toContain('LOVE')
    expect(html).toContain('HUNGER')
    expect(html).toContain('TIRED')
  })

  it('renders nothing when visible is false', () => {
    const wrapper = mount(SushiMetersOverlay, {
      props: { visible: false, love: 50, hunger: 50, tired: 50 },
    })
    expect(wrapper.find('canvas').exists()).toBe(false)
    expect(wrapper.html()).not.toContain('LOVE')
  })
})

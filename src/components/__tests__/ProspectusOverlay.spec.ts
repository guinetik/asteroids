import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import ProspectusOverlay from '@/components/ProspectusOverlay.vue'

describe('ProspectusOverlay', () => {
  it('renders header, asset card, recommendation, and both CTAs for hektor', () => {
    const wrapper = mount(ProspectusOverlay, {
      props: { bodyId: 'hektor', onResolve: () => {} },
    })
    const html = wrapper.html()
    expect(html).toContain('JOVIAN SOCIETY')
    expect(html).toContain('Prospectus Compilation')
    expect(html).toContain('ASSET 2306-J')
    expect(html).toContain('624 HEKTOR')
    expect(html).toContain('extraction queue')
    expect(html).toContain('TRANSMIT')
    expect(html).toContain('Tamper')
  })

  it('fires onResolve("transmit") on E key after the settle window', async () => {
    vi.useFakeTimers()
    const onResolve = vi.fn()
    mount(ProspectusOverlay, { props: { bodyId: 'hektor', onResolve }, attachTo: document.body })
    vi.advanceTimersByTime(1600) // past the 1.5s idle → awaiting-choice settle
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
    vi.advanceTimersByTime(1600) // past the 1.5s resolving → resolved lockout
    expect(onResolve).toHaveBeenCalledTimes(1)
    expect(onResolve).toHaveBeenCalledWith('transmit')
    vi.useRealTimers()
  })

  it('fires onResolve("tamper") on Q key', async () => {
    vi.useFakeTimers()
    const onResolve = vi.fn()
    mount(ProspectusOverlay, { props: { bodyId: 'hektor', onResolve }, attachTo: document.body })
    vi.advanceTimersByTime(1600)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))
    vi.advanceTimersByTime(1600)
    expect(onResolve).toHaveBeenCalledTimes(1)
    expect(onResolve).toHaveBeenCalledWith('tamper')
    vi.useRealTimers()
  })

  it('does not refire onResolve when E is pressed twice', async () => {
    vi.useFakeTimers()
    const onResolve = vi.fn()
    mount(ProspectusOverlay, { props: { bodyId: 'hektor', onResolve }, attachTo: document.body })
    vi.advanceTimersByTime(1600)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'q' }))
    vi.advanceTimersByTime(1600)
    expect(onResolve).toHaveBeenCalledTimes(1)
    expect(onResolve).toHaveBeenCalledWith('transmit')
    vi.useRealTimers()
  })
})

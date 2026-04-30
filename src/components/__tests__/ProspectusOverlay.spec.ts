import { describe, it, expect } from 'vitest'
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
})

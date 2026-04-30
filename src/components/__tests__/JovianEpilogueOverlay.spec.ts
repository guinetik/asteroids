import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import JovianEpilogueOverlay from '@/components/JovianEpilogueOverlay.vue'

describe('JovianEpilogueOverlay', () => {
  it('renders the video, subtitle, and Continue button', () => {
    const wrapper = mount(JovianEpilogueOverlay, {
      props: { onContinue: () => {} },
    })
    const html = wrapper.html()
    expect(html).toContain('<video')
    expect(html).toContain('jovian-ending.mp4')
    expect(html).toContain('jovian-ending.webp') // poster
    expect(html).toContain('Asset 2306-J')
    expect(html).toContain('Continue')
  })
})

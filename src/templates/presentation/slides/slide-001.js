const presentationTitle = '__PRESENTATION_TITLE__'

export default {
  name: 'Slide001',
  setup() {
    return {
      presentationTitle,
    }
  },
  template: `
    <section class="slide">
      <p class="slide__eyebrow">Presentation</p>
      <h1 class="slide__title">{{ presentationTitle }}</h1>
      <p class="slide__description">Start creating your presentation.</p>
    </section>
  `,
}

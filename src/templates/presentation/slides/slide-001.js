export default {
  name: 'Slide001',
  props: {
    manifest: {
      type: Object,
      required: true,
    },
  },
  template: `
    <section class="slide">
      <p class="slide__eyebrow">Presentation</p>
      <h1 class="slide__title">{{ manifest.name }}</h1>
      <p class="slide__description">Start creating your presentation.</p>
    </section>
  `,
}

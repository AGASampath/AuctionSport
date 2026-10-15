import { Component, input } from '@angular/core';

/** Stand-in for screens not built yet. */
@Component({
  selector: 'app-placeholder-page',
  template: `
    <section class="page">
      <h1>{{ heading() }}</h1>
      <p class="muted">Not built yet. See wireframe {{ wireframe() }} in docs/wireframes.html.</p>
    </section>
  `,
})
export class PlaceholderPage {
  // Bound from route data (withComponentInputBinding).
  readonly heading = input('');
  readonly wireframe = input<number>();
}

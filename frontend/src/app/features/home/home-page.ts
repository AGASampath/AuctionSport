import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home-page',
  imports: [RouterLink],
  template: `
    <section class="page narrow">
      <h1>Player auction</h1>
      <p class="muted">Choose your screen.</p>
      <div class="stack">
        <a class="btn primary big" routerLink="/login">Team owner (phone)</a>
        <a class="btn big" routerLink="/screen">Big screen</a>
        <a class="btn big" routerLink="/admin">Admin</a>
      </div>
    </section>
  `,
})
export class HomePage {}

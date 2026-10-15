import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/admin-key.interceptor';
import { PublicAuction, auctionLabel } from '../../core/models';

/** Choose which live auction the projector shows. Goes straight there when only one is live. */
@Component({
  selector: 'app-screen-picker',
  imports: [RouterLink],
  template: `
    <section class="page narrow">
      <h1>Big screen</h1>
      @if (error()) {
        <p class="error">{{ error() }}</p>
      } @else if (!loaded()) {
        <p class="muted">Loading...</p>
      } @else if (auctions().length === 0) {
        <p class="muted">No auction is live. Set an auction to Live in the admin, then refresh.</p>
      } @else {
        <p class="muted">Choose the auction to show.</p>
        <div class="stack">
          @for (a of auctions(); track a.id) {
            <a class="btn big" [routerLink]="['/screen', a.id]">{{ label(a) }}</a>
          }
        </div>
      }
    </section>
  `,
})
export class ScreenPicker {
  private api = inject(ApiService);
  private router = inject(Router);

  protected auctions = signal<PublicAuction[]>([]);
  protected loaded = signal(false);
  protected error = signal<string | null>(null);
  protected label = auctionLabel;

  constructor() {
    this.api.auctions().subscribe({
      next: (list) => {
        if (list.length === 1) {
          this.router.navigate(['/screen', list[0].id], { replaceUrl: true });
          return;
        }
        this.auctions.set(list);
        this.loaded.set(true);
      },
      error: (e) => this.error.set(errorMessage(e)),
    });
  }
}

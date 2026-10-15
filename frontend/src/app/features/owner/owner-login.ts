import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/admin-key.interceptor';
import { PublicAuction, TeamSummary, auctionLabel } from '../../core/models';
import { SessionStore } from '../../core/session.store';

/** Wireframe 1: owner picks the auction (skipped when only one is live), their team, and enters the PIN. */
@Component({
  selector: 'app-owner-login',
  imports: [FormsModule],
  template: `
    <section class="page narrow">
      <h1>Player auction</h1>
      <p class="muted">Team owner login</p>

      @if (loaded() && auctions().length === 0) {
        <p class="card">No auction is open for bidding yet. Ask the organiser, then refresh this page.</p>
      } @else {
        <form class="stack" (ngSubmit)="submit()">
          @if (auctions().length > 1) {
            <label class="field">
              <span>Auction</span>
              <select name="auction" [ngModel]="auctionId()" (ngModelChange)="selectAuction($event)" required>
                <option [ngValue]="null" disabled>Select the auction</option>
                @for (a of auctions(); track a.id) {
                  <option [ngValue]="a.id">{{ label(a) }}</option>
                }
              </select>
            </label>
          } @else if (auctions().length === 1) {
            <p class="auction">{{ label(auctions()[0]) }}</p>
          }
          <label class="field">
            <span>Team</span>
            <select name="team" [(ngModel)]="teamId" required [disabled]="!auctionId()">
              <option [ngValue]="null" disabled>Select your team</option>
              @for (t of teams(); track t.id) {
                <option [ngValue]="t.id">{{ t.name }}</option>
              }
            </select>
          </label>
          <label class="field">
            <span>PIN</span>
            <input name="pin" [(ngModel)]="pin" inputmode="numeric" autocomplete="off" placeholder="4-digit PIN" required />
          </label>
          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
          <button class="btn primary big" type="submit" [disabled]="busy() || teamId === null || !pin">Enter auction</button>
        </form>
      }
    </section>
  `,
  styles: `
    .auction {
      margin: 0;
      font-weight: 600;
      color: var(--accent);
    }
  `,
})
export class OwnerLogin {
  private api = inject(ApiService);
  private session = inject(SessionStore);
  private router = inject(Router);

  protected auctions = signal<PublicAuction[]>([]);
  protected auctionId = signal<number | null>(null);
  protected teams = signal<TeamSummary[]>([]);
  protected loaded = signal(false);
  protected error = signal<string | null>(null);
  protected busy = signal(false);
  protected teamId: number | null = null;
  protected pin = '';
  protected label = auctionLabel;

  constructor() {
    this.api.auctions().subscribe({
      next: (list) => {
        this.auctions.set(list);
        this.loaded.set(true);
        if (list.length === 1) this.selectAuction(list[0].id);
      },
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  selectAuction(id: number) {
    this.auctionId.set(id);
    this.teamId = null;
    this.teams.set([]);
    this.api.teams(id).subscribe({
      next: (t) => this.teams.set(t),
      error: (e) => this.error.set(errorMessage(e)),
    });
  }

  submit() {
    if (this.teamId === null) return;
    this.busy.set(true);
    this.error.set(null);
    this.api.login(this.teamId, this.pin.trim()).subscribe({
      next: (res) => {
        this.session.setOwner(res);
        this.router.navigate(['/bid']);
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.busy.set(false);
      },
    });
  }
}

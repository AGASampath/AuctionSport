import { Component, OnDestroy, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { errorMessage } from '../../../core/admin-key.interceptor';
import { AdminApiService } from '../../../core/api.service';
import { AuctionHubService } from '../../../core/auction-hub.service';
import { Auction } from '../../../core/models';

/** Everything for one auction (for example "001 - BPL") lives under this frame. */
@Component({
  selector: 'app-auction-workspace',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="ws-head">
      <div class="page">
        @if (auction(); as a) {
          <div class="title">
            <h1>{{ a.code }} - {{ a.name }}</h1>
            <span class="status" [class]="a.status.toLowerCase()">{{ a.status }}</span>
            <a class="edit" [routerLink]="['/admin/auctions', a.id, 'edit']">Edit details</a>
          </div>
          <p class="muted meta">
            {{ meta() }}
            <span class="pill" [class.bad]="hub.status() !== 'connected'">live feed: {{ hub.status() }}</span>
          </p>
        } @else if (error()) {
          <p class="error">{{ error() }}</p>
        } @else {
          <p class="muted">Loading...</p>
        }
        <nav class="tabs">
          <a routerLink="config" routerLinkActive="active">Configuration</a>
          <a routerLink="teams" routerLinkActive="active">Teams</a>
          <a routerLink="players" routerLinkActive="active">Players</a>
          <a routerLink="live" routerLinkActive="active">Live control</a>
          <a routerLink="reports" routerLinkActive="active">Reports</a>
        </nav>
      </div>
    </div>
    <router-outlet />
  `,
  styles: `
    .ws-head {
      border-bottom: 1px solid var(--line);
      .page {
        padding-bottom: 0;
      }
    }
    .title {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 12px;
      h1 {
        margin: 0;
      }
    }
    .edit {
      color: var(--accent);
      font-size: 14px;
    }
    .meta {
      margin: 4px 0 12px;
      .pill {
        margin-left: 8px;
      }
    }
    .tabs {
      display: flex;
      gap: 4px 20px;
      overflow-x: auto;
      a {
        padding: 8px 0;
        color: var(--muted);
        text-decoration: none;
        white-space: nowrap;
        border-bottom: 3px solid transparent;
        &.active {
          color: var(--accent);
          font-weight: 600;
          border-bottom-color: var(--accent);
        }
      }
    }
  `,
})
export class AuctionWorkspace implements OnDestroy {
  private admin = inject(AdminApiService);
  protected hub = inject(AuctionHubService);

  readonly auctionIdParam = input.required<string>({ alias: 'auctionId' });
  private auctionId = computed(() => Number(this.auctionIdParam()));

  protected auction = signal<Auction | null>(null);
  protected error = signal<string | null>(null);
  protected meta = computed(() => {
    const a = this.auction();
    return a ? [a.auctionDate ?? 'No date set', a.venue].filter((x) => !!x).join(', ') : '';
  });

  constructor() {
    // Reload when switching between auctions (the component is reused).
    effect(() => {
      const id = this.auctionId();
      this.auction.set(null);
      this.error.set(null);
      this.admin.auction(id).subscribe({
        next: (a) => this.auction.set(a),
        error: (e) => this.error.set(e.status === 404 ? 'This auction no longer exists.' : errorMessage(e)),
      });
      this.hub.connect({ auctionId: id }).catch(() => {});
    });
  }

  ngOnDestroy() {
    void this.hub.disconnect();
  }
}

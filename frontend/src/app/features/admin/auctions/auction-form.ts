import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { errorMessage } from '../../../core/admin-key.interceptor';
import { AdminApiService } from '../../../core/api.service';
import { AUCTION_STATUSES, AuctionRequest } from '../../../core/models';

/** Create (/admin/auctions/new) or edit (/admin/auctions/:auctionId/edit) an auction's details. */
@Component({
  selector: 'app-auction-form',
  imports: [FormsModule, RouterLink],
  template: `
    <section class="page form-page">
      <h1>{{ auctionId() ? 'Edit auction' : 'New auction' }}</h1>
      <p class="muted">
        @if (auctionId()) {
          Teams, players and configuration are managed inside the auction.
        } @else {
          The auction starts with the default configuration. You can change it after saving.
        }
      </p>

      @if (loading()) {
        <p class="muted">Loading...</p>
      } @else {
        <form class="card" (ngSubmit)="save()" #f="ngForm">
          <div class="grid2">
            <label class="field">
              <span>Code</span>
              <input name="code" [(ngModel)]="model.code" required maxlength="20" placeholder="001" />
            </label>
            <label class="field">
              <span>Name</span>
              <input name="name" [(ngModel)]="model.name" required placeholder="BPL" />
            </label>
            <label class="field">
              <span>Date</span>
              <input name="date" type="date" [(ngModel)]="model.auctionDate" />
            </label>
            <label class="field">
              <span>Venue</span>
              <input name="venue" [(ngModel)]="model.venue" placeholder="Optional" />
            </label>
          </div>

          <fieldset class="statuses">
            <legend>Status</legend>
            @for (s of statuses; track s.value) {
              <label class="radio">
                <input type="radio" name="status" [value]="s.value" [(ngModel)]="model.status" />
                <span>
                  <strong>{{ s.label }}</strong>
                  <small class="muted">{{ s.hint }}</small>
                </span>
              </label>
            }
          </fieldset>

          @if (error()) {
            <p class="error">{{ error() }}</p>
          }

          <div class="buttons">
            <a class="btn" routerLink="/admin">Cancel</a>
            <button class="btn primary" type="submit" [disabled]="saving() || f.invalid">
              {{ auctionId() ? 'Save changes' : 'Create auction' }}
            </button>
          </div>
        </form>
      }
    </section>
  `,
  styles: `
    .form-page {
      max-width: 640px;
    }
    .statuses {
      border: 0;
      padding: 0;
      margin: 16px 0 0;
      display: grid;
      gap: 8px;
      legend {
        font-size: 12px;
        color: var(--muted);
        margin-bottom: 4px;
      }
    }
    .radio {
      display: flex;
      gap: 10px;
      align-items: flex-start;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 12px;
      cursor: pointer;
      input {
        min-height: 0;
        margin-top: 3px;
      }
      span {
        display: flex;
        flex-direction: column;
      }
      &:has(input:checked) {
        border-color: var(--accent);
        background: var(--tint);
      }
    }
    .error {
      margin-top: 12px;
    }
    .buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }
  `,
})
export class AuctionForm implements OnInit {
  private admin = inject(AdminApiService);
  private router = inject(Router);

  /** Route param; absent when creating. */
  readonly auctionIdParam = input<string | undefined>(undefined, { alias: 'auctionId' });
  protected readonly auctionId = computed(() => Number(this.auctionIdParam()) || null);

  protected statuses = AUCTION_STATUSES;
  protected model: AuctionRequest = { code: '', name: '', venue: '', auctionDate: null, status: 'Draft' };
  protected loading = signal(false);
  protected saving = signal(false);
  protected error = signal<string | null>(null);

  ngOnInit() {
    const id = this.auctionId();
    if (!id) return;
    this.loading.set(true);
    this.admin.auction(id).subscribe({
      next: (a) => {
        this.model = { code: a.code, name: a.name, venue: a.venue, auctionDate: a.auctionDate, status: a.status };
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.loading.set(false);
      },
    });
  }

  save() {
    const id = this.auctionId();
    const body: AuctionRequest = {
      ...this.model,
      code: this.model.code.trim(),
      name: this.model.name.trim(),
      auctionDate: this.model.auctionDate || null,
    };
    this.saving.set(true);
    this.error.set(null);
    const request = id ? this.admin.updateAuction(id, body) : this.admin.createAuction(body);
    request.subscribe({
      // A new auction goes straight to its workspace; an edit returns to the list.
      next: (a) => this.router.navigate(id ? ['/admin'] : ['/admin/auctions', a.id]),
      error: (e) => {
        this.error.set(errorMessage(e));
        this.saving.set(false);
      },
    });
  }
}

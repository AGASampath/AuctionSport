import { Component, WritableSignal, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorMessage } from '../../../core/admin-key.interceptor';
import { AdminApiService } from '../../../core/api.service';
import { AuctionConfig } from '../../../core/models';
import { MoneyPipe } from '../../../shared/money.pipe';

const parse = (csv: string) =>
  [...new Set(csv.split(',').map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0))].sort((a, b) => a - b);

/** Wireframe 6: configuration for one auction. Changes made during the auction apply from the next bid. */
@Component({
  selector: 'app-config-page',
  imports: [FormsModule, MoneyPipe],
  template: `
    <section class="page config">
      @if (loadError()) {
        <p class="error">{{ loadError() }}</p>
      } @else if (form(); as f) {
        <p class="muted intro">
          Settings for this auction only. Changes made during the auction apply from the next bid.
          Currently in round {{ saved()?.currentRound }}.
        </p>

        <form (ngSubmit)="save()">
          <div class="card">
            <h2>Bid buttons</h2>
            <p class="muted">The amounts owners tap to raise the bid.</p>

            <div class="round">
              <span class="label">Round 1</span>
              <div class="chips">
                @for (n of round1(); track n) {
                  <span class="chip">
                    +{{ n | money }}
                    <button type="button" (click)="removeStep(round1, n)" [attr.aria-label]="'Remove ' + n">×</button>
                  </span>
                } @empty {
                  <span class="error">Add at least one button.</span>
                }
              </div>
              <div class="add">
                <input type="number" min="1" name="new1" [(ngModel)]="new1" placeholder="Amount" />
                <button class="btn small" type="button" (click)="addStep(round1, new1); new1 = null">Add</button>
              </div>
            </div>

            <div class="round">
              <span class="label">Round 2</span>
              <div class="chips">
                @for (n of round2(); track n) {
                  <span class="chip">
                    +{{ n | money }}
                    <button type="button" (click)="removeStep(round2, n)" [attr.aria-label]="'Remove ' + n">×</button>
                  </span>
                } @empty {
                  <span class="muted">Same as round 1</span>
                }
              </div>
              <div class="add">
                <input type="number" min="1" name="new2" [(ngModel)]="new2" placeholder="Amount" />
                <button class="btn small" type="button" (click)="addStep(round2, new2); new2 = null">Add</button>
              </div>
            </div>
          </div>

          <div class="card">
            <h2>Timing</h2>
            <div class="grid2">
              <label class="field">
                <span>Confirm wait (seconds)</span>
                <input type="number" min="5" name="confirm" [(ngModel)]="f.confirmSeconds" required />
              </label>
              <div class="field">
                <span>Reset on new bid</span>
                <p class="static">Yes, full time</p>
              </div>
            </div>
          </div>

          <div class="card">
            <h2>Wallet and squad rules</h2>
            <div class="grid2">
              <label class="field">
                <span>Default team wallet</span>
                <input type="number" min="0" name="wallet" [(ngModel)]="f.defaultWallet" required />
              </label>
              <label class="field">
                <span>Low wallet alert</span>
                <input type="number" min="0" name="low" [(ngModel)]="f.lowWalletAlert" required />
              </label>
              <label class="field">
                <span>Min squad size</span>
                <input type="number" min="0" name="min" [(ngModel)]="f.minSquad" required />
              </label>
              <label class="field">
                <span>Max squad size</span>
                <input type="number" min="1" name="max" [(ngModel)]="f.maxSquad" required />
              </label>
            </div>
            <label class="check">
              <input type="checkbox" name="reserve" [(ngModel)]="f.reserveForMinSquad" />
              Keep enough wallet to fill the minimum squad
            </label>
            <p class="muted small">The default wallet is used for new teams. Existing teams keep their own wallet.</p>
          </div>

          @if (error()) {
            <p class="error">{{ error() }}</p>
          }
          @if (message()) {
            <p class="ok">{{ message() }}</p>
          }

          <div class="buttons">
            <button class="btn" type="button" (click)="reset()" [disabled]="saving()">Reset to saved</button>
            <button class="btn primary" type="submit" [disabled]="saving() || round1().length === 0">Save changes</button>
          </div>
        </form>
      } @else {
        <p class="muted">Loading...</p>
      }
    </section>
  `,
  styles: `
    // Left-aligned with the workspace header; the form itself stays a readable width.
    .config > * {
      max-width: 760px;
    }
    .intro {
      margin-top: 0;
    }
    h2 {
      font-size: 16px;
      margin: 0 0 4px;
    }
    .card > .muted {
      margin: 0 0 12px;
      font-size: 13px;
    }
    .round {
      display: grid;
      grid-template-columns: 80px 1fr auto;
      gap: 8px 12px;
      align-items: center;
      padding: 10px 0;
      border-top: 1px solid #e6ede3;
      @media (max-width: 560px) {
        grid-template-columns: 1fr;
      }
    }
    .label {
      font-weight: 600;
      font-size: 14px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      border: 1px solid #8fa08c;
      border-radius: 6px;
      padding: 2px 4px 2px 10px;
      font-size: 14px;
      button {
        border: 0;
        background: none;
        font-size: 16px;
        line-height: 1;
        cursor: pointer;
        color: var(--muted);
        padding: 2px 6px;
        &:hover {
          color: var(--danger);
        }
      }
    }
    .add {
      display: flex;
      gap: 6px;
      input {
        width: 110px;
        min-height: 36px;
        padding: 6px 10px;
      }
    }
    .static {
      margin: 0;
      padding: 10px 0;
    }
    .check {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-top: 14px;
      input {
        min-height: 0;
        width: 18px;
        height: 18px;
      }
    }
    .small {
      font-size: 12px;
      margin: 8px 0 0;
    }
    .ok {
      color: var(--accent);
    }
    .buttons {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  `,
})
export class ConfigPage {
  private admin = inject(AdminApiService);

  readonly auctionIdParam = input.required<string>({ alias: 'auctionId' });
  private auctionId = computed(() => Number(this.auctionIdParam()));

  protected saved = signal<AuctionConfig | null>(null);
  protected form = signal<AuctionConfig | null>(null);
  protected round1 = signal<number[]>([]);
  protected round2 = signal<number[]>([]);
  protected new1: number | null = null;
  protected new2: number | null = null;

  protected loadError = signal<string | null>(null);
  protected error = signal<string | null>(null);
  protected message = signal<string | null>(null);
  protected saving = signal(false);

  constructor() {
    effect(() => {
      const id = this.auctionId();
      this.form.set(null);
      this.admin.config(id).subscribe({
        next: (c) => this.apply(c),
        error: (e) => this.loadError.set(errorMessage(e)),
      });
    });
  }

  addStep(list: WritableSignal<number[]>, value: number | null) {
    if (!value || value <= 0) return;
    list.update((xs) => [...new Set([...xs, Math.round(value)])].sort((a, b) => a - b));
  }

  removeStep(list: WritableSignal<number[]>, value: number) {
    list.update((xs) => xs.filter((x) => x !== value));
  }

  reset() {
    const c = this.saved();
    if (c) this.apply(c);
  }

  save() {
    const f = this.form();
    if (!f) return;
    if (f.minSquad > f.maxSquad) {
      this.error.set('Min squad size cannot be more than max squad size.');
      return;
    }
    const body: AuctionConfig = {
      ...f,
      bidIncrements: this.round1().join(','),
      round2Increments: this.round2().join(','),
    };
    this.saving.set(true);
    this.error.set(null);
    this.message.set(null);
    this.admin.saveConfig(this.auctionId(), body).subscribe({
      next: (c) => {
        this.apply(c);
        this.message.set('Saved.');
        this.saving.set(false);
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.saving.set(false);
      },
    });
  }

  private apply(c: AuctionConfig) {
    this.saved.set(c);
    this.form.set({ ...c });
    this.round1.set(parse(c.bidIncrements));
    this.round2.set(parse(c.round2Increments));
    this.error.set(null);
  }
}

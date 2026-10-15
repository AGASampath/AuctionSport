import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorMessage } from '../../../core/admin-key.interceptor';
import { AdminApiService } from '../../../core/api.service';
import { AuctionSummary, auctionLabel } from '../../../core/models';

/** Admin home: every auction, with add, edit, delete, and open. */
@Component({
  selector: 'app-auction-list',
  imports: [RouterLink],
  template: `
    <section class="page">
      <div class="head">
        <div>
          <h1>Auctions</h1>
          <p class="muted">Open an auction to manage its teams, players, configuration and live bidding.</p>
        </div>
        <a class="btn primary" routerLink="/admin/auctions/new">New auction</a>
      </div>

      @if (error()) {
        <p class="error">{{ error() }}</p>
      }

      @if (loading()) {
        <p class="muted">Loading...</p>
      } @else if (auctions().length === 0) {
        <div class="empty">
          <p><strong>No auctions yet.</strong></p>
          <p class="muted">Create one, for example code 001, name BPL.</p>
          <a class="btn primary" routerLink="/admin/auctions/new">New auction</a>
        </div>
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th class="wide">Date</th>
                <th class="wide">Venue</th>
                <th>Status</th>
                <th class="num wide">Teams</th>
                <th class="num wide">Players</th>
                <th class="num wide">Sold</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              @for (a of auctions(); track a.id) {
                <tr>
                  <td><a class="code" [routerLink]="['/admin/auctions', a.id]">{{ a.code }}</a></td>
                  <td>{{ a.name }}</td>
                  <td class="wide">{{ a.auctionDate ?? '-' }}</td>
                  <td class="wide">{{ a.venue || '-' }}</td>
                  <td><span class="status" [class]="a.status.toLowerCase()">{{ a.status }}</span></td>
                  <td class="num wide">{{ a.teams }}</td>
                  <td class="num wide">{{ a.players }}</td>
                  <td class="num wide">{{ a.sold }}</td>
                  <td class="actions">
                    <a class="btn small primary" [routerLink]="['/admin/auctions', a.id]">Open</a>
                    <a class="btn small" [routerLink]="['/admin/auctions', a.id, 'edit']">Edit</a>
                    <button class="btn small danger-outline" type="button" (click)="askDelete(a)">Delete</button>
                  </td>
                </tr>
                @if (confirming()?.id === a.id) {
                  <tr class="confirm">
                    <td colspan="9">
                      @if (a.status === 'Live') {
                        <span>{{ label(a) }} is live. Set it to Draft or Completed before deleting it.</span>
                        <button class="btn small" type="button" (click)="confirming.set(null)">OK</button>
                      } @else {
                        <span>
                          Delete <strong>{{ label(a) }}</strong>? This permanently removes {{ a.teams }} teams,
                          {{ a.players }} players and {{ a.sold }} sales.
                        </span>
                        <button class="btn small" type="button" (click)="confirming.set(null)" [disabled]="deleting()">Cancel</button>
                        <button class="btn small danger" type="button" (click)="remove(a)" [disabled]="deleting()">Delete auction</button>
                      }
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        </div>
      }
    </section>
  `,
  styles: `
    .head {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 16px;
    }
    .code {
      font-weight: 600;
      color: var(--accent);
    }
    .actions {
      white-space: nowrap;
      text-align: right;
      .btn + .btn {
        margin-left: 6px;
      }
    }
    // Phones: keep code, name, status and the buttons; let the buttons wrap.
    @media (max-width: 640px) {
      .wide {
        display: none;
      }
      .actions {
        white-space: normal;
        .btn {
          margin: 2px 0 2px 4px;
        }
      }
    }
    .confirm td {
      background: #fdf3f2;
      border-top: 0;
      span {
        margin-right: 12px;
      }
      .btn + .btn {
        margin-left: 6px;
      }
    }
    .empty {
      border: 1px dashed var(--line);
      border-radius: var(--radius);
      padding: 24px;
      text-align: center;
      p {
        margin: 0 0 8px;
      }
    }
  `,
})
export class AuctionList {
  private admin = inject(AdminApiService);

  protected auctions = signal<AuctionSummary[]>([]);
  protected loading = signal(true);
  protected error = signal<string | null>(null);
  protected confirming = signal<AuctionSummary | null>(null);
  protected deleting = signal(false);
  protected label = auctionLabel;

  constructor() {
    this.load();
  }

  load() {
    this.admin.auctions().subscribe({
      next: (list) => {
        this.auctions.set(list);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.loading.set(false);
      },
    });
  }

  askDelete(a: AuctionSummary) {
    this.error.set(null);
    this.confirming.set(a);
  }

  remove(a: AuctionSummary) {
    this.deleting.set(true);
    this.admin.deleteAuction(a.id).subscribe({
      next: () => {
        this.auctions.update((list) => list.filter((x) => x.id !== a.id));
        this.confirming.set(null);
        this.deleting.set(false);
      },
      error: (e) => {
        this.error.set(errorMessage(e));
        this.confirming.set(null);
        this.deleting.set(false);
      },
    });
  }
}

import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { SessionStore } from '../../core/session.store';

/** Frame for every admin page: brand, link back to the auction list, log out. */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink],
  template: `
    <header class="topbar">
      <a class="brand" routerLink="/admin">Auction admin</a>
      <span class="spacer"></span>
      <a routerLink="/admin">All auctions</a>
      <button class="btn small" type="button" (click)="logout()">Log out</button>
    </header>
    <router-outlet />
  `,
  styles: `
    .brand {
      font-weight: 700;
      color: var(--ink);
      text-decoration: none;
    }
    .spacer {
      flex: 1;
    }
    a:not(.brand) {
      color: var(--accent);
    }
  `,
})
export class AdminLayout {
  private session = inject(SessionStore);
  private router = inject(Router);

  logout() {
    this.session.setAdminKey(null);
    this.router.navigate(['/admin/login']);
  }
}

import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AdminApiService } from '../../core/api.service';
import { errorMessage } from '../../core/admin-key.interceptor';
import { SessionStore } from '../../core/session.store';

/** Admin enters the AdminKey from backend appsettings.json; it is checked against /api/admin/auctions. */
@Component({
  selector: 'app-admin-login',
  imports: [FormsModule],
  template: `
    <section class="page narrow">
      <h1>Admin</h1>
      <form class="stack" (ngSubmit)="submit()">
        <label class="field">
          <span>Admin key</span>
          <input name="key" type="password" [(ngModel)]="key" autocomplete="current-password" required />
        </label>
        @if (error()) {
          <p class="error">{{ error() }}</p>
        }
        <button class="btn primary big" type="submit" [disabled]="busy() || !key">Continue</button>
      </form>
    </section>
  `,
})
export class AdminLogin {
  private admin = inject(AdminApiService);
  private session = inject(SessionStore);
  private router = inject(Router);

  protected error = signal<string | null>(null);
  protected busy = signal(false);
  protected key = '';

  submit() {
    this.busy.set(true);
    this.error.set(null);
    this.session.setAdminKey(this.key.trim());
    this.admin.auctions().subscribe({
      next: () => this.router.navigate(['/admin']),
      error: (e) => {
        this.session.setAdminKey(null);
        this.error.set(e.status === 401 ? 'Wrong admin key.' : errorMessage(e));
        this.busy.set(false);
      },
    });
  }
}

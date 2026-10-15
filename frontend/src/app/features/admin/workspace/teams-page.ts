import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Observable, concatMap, forkJoin, of } from 'rxjs';
import { errorMessage } from '../../../core/admin-key.interceptor';
import { AdminApiService } from '../../../core/api.service';
import { AuctionConfig, TeamRequest, TeamRow } from '../../../core/models';
import { ImagePicker } from '../../../shared/image-picker';
import { MoneyPipe } from '../../../shared/money.pipe';

interface TeamForm {
  name: string;
  shortName: string;
  ownerName: string;
  phone: string;
  pin: string;
  wallet: number | null;
  squadSize: number | null;
}

/** Wireframe 4: add, edit and delete the teams of one auction, one at a time, with a logo. */
@Component({
  selector: 'app-teams-page',
  imports: [FormsModule, MoneyPipe, ImagePicker],
  templateUrl: './teams-page.html',
  styles: `
    code {
      font-size: 13px;
      background: var(--soft);
      padding: 1px 6px;
      border-radius: 4px;
    }
    .grid2 {
      margin-top: 14px;
    }
  `,
})
export class TeamsPage {
  private admin = inject(AdminApiService);

  readonly auctionIdParam = input.required<string>({ alias: 'auctionId' });
  private auctionId = computed(() => Number(this.auctionIdParam()));

  protected teams = signal<TeamRow[]>([]);
  protected config = signal<AuctionConfig | null>(null);
  protected loading = signal(true);
  protected loadError = signal<string | null>(null);

  /** Team being edited, or null when adding. */
  protected editing = signal<TeamRow | null>(null);
  protected form: TeamForm = this.blank();
  private shortNameTouched = false;

  // Logo chosen in the form but not uploaded yet, or the saved one marked for removal.
  protected logoFile = signal<File | null>(null);
  protected removeLogo = signal(false);

  protected saving = signal(false);
  protected formError = signal<string | null>(null);
  protected notice = signal<string | null>(null);

  protected confirmDelete = signal<TeamRow | null>(null);
  protected listError = signal<string | null>(null);

  protected totals = computed(() => {
    const list = this.teams();
    return {
      wallet: list.reduce((s, t) => s + t.wallet, 0),
      players: list.reduce((s, t) => s + t.players, 0),
    };
  });

  constructor() {
    effect(() => {
      const id = this.auctionId();
      this.loading.set(true);
      forkJoin([this.admin.config(id), this.admin.teams(id)]).subscribe({
        next: ([cfg, teams]) => {
          this.config.set(cfg);
          this.teams.set(teams);
          this.startAdd();
          this.loading.set(false);
        },
        error: (e) => {
          this.loadError.set(errorMessage(e));
          this.loading.set(false);
        },
      });
    });
  }

  // ---------- form ----------

  startAdd(form?: NgForm) {
    this.editing.set(null);
    this.form = this.blank();
    this.shortNameTouched = false;
    this.resetLogo();
    this.formError.set(null);
    // Values follow the bindings; only clear the touched marks. (resetForm would fire ngModelChange on every field.)
    form?.control.markAsUntouched();
    form?.control.markAsPristine();
  }

  startEdit(t: TeamRow, form?: NgForm) {
    this.editing.set(t);
    this.form = {
      name: t.name,
      shortName: t.shortName,
      ownerName: t.ownerName,
      phone: t.phone,
      pin: t.pin,
      wallet: t.wallet,
      squadSize: t.squadSize,
    };
    this.shortNameTouched = true;
    this.resetLogo();
    this.formError.set(null);
    this.notice.set(null);
    form?.control.markAsUntouched();
    this.confirmDelete.set(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** Suggests a short name (first three letters) until the admin types one. */
  nameChanged(name: string) {
    this.form.name = name;
    if (!this.shortNameTouched) {
      this.form.shortName = name.replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase();
    }
  }

  shortNameChanged(value: string) {
    this.shortNameTouched = true;
    this.form.shortName = value.toUpperCase();
  }

  /** Random 4-digit PIN not used by another team in this auction. */
  generatePin() {
    const used = new Set(this.teams().filter((t) => t.id !== this.editing()?.id).map((t) => t.pin));
    let pin: string;
    do {
      pin = String(1000 + Math.floor(Math.random() * 9000));
    } while (used.has(pin));
    this.form.pin = pin;
  }

  save(form: NgForm) {
    if (form.invalid) {
      form.control.markAllAsTouched();
      this.formError.set('Fill in the required fields.');
      return;
    }
    const auctionId = this.auctionId();
    const editing = this.editing();
    const body: TeamRequest = {
      name: this.form.name.trim(),
      shortName: this.form.shortName.trim(),
      ownerName: this.form.ownerName.trim(),
      phone: this.form.phone.trim(),
      pin: this.form.pin.trim(),
      wallet: this.form.wallet ?? 0,
      squadSize: this.form.squadSize ?? 0,
    };
    const file = this.logoFile();
    const remove = this.removeLogo();

    this.saving.set(true);
    this.formError.set(null);
    this.notice.set(null);

    const saveTeam = editing ? this.admin.updateTeam(auctionId, editing.id, body) : this.admin.createTeam(auctionId, body);
    let teamSaved: TeamRow | null = null;

    saveTeam
      .pipe(
        concatMap((team): Observable<TeamRow> => {
          teamSaved = team;
          if (file) return this.admin.uploadLogo(auctionId, team.id, file);
          if (remove) return this.admin.removeLogo(auctionId, team.id);
          return of(team);
        }),
      )
      .subscribe({
        next: (team) => {
          this.upsert(team);
          this.notice.set(editing ? `${team.name} updated.` : `${team.name} added.`);
          this.saving.set(false);
          this.startAdd(form);
        },
        error: (e) => {
          this.saving.set(false);
          if (teamSaved) {
            // The team itself was saved; only the logo step failed. Keep editing it so the admin can retry.
            this.upsert(teamSaved);
            this.editing.set(teamSaved);
            this.formError.set(`Team saved, but the logo could not be updated: ${errorMessage(e)}`);
          } else {
            this.formError.set(errorMessage(e));
          }
        },
      });
  }

  // ---------- list ----------

  askDelete(t: TeamRow) {
    this.listError.set(null);
    this.confirmDelete.set(t);
  }

  remove(t: TeamRow) {
    this.admin.deleteTeam(this.auctionId(), t.id).subscribe({
      next: () => {
        this.teams.update((list) => list.filter((x) => x.id !== t.id));
        this.confirmDelete.set(null);
        if (this.editing()?.id === t.id) this.startAdd();
        this.notice.set(`${t.name} deleted.`);
      },
      error: (e) => {
        this.confirmDelete.set(null);
        this.listError.set(errorMessage(e));
      },
    });
  }

  // ---------- helpers ----------

  private blank(): TeamForm {
    const cfg = this.config();
    return {
      name: '',
      shortName: '',
      ownerName: '',
      phone: '',
      pin: '',
      wallet: cfg?.defaultWallet ?? null,
      squadSize: cfg?.maxSquad ?? null,
    };
  }

  private upsert(team: TeamRow) {
    this.teams.update((list) =>
      list.some((t) => t.id === team.id) ? list.map((t) => (t.id === team.id ? team : t)) : [...list, team],
    );
  }

  private resetLogo() {
    this.logoFile.set(null);
    this.removeLogo.set(false);
  }
}

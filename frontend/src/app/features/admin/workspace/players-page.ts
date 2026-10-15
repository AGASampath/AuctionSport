import { Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule, NgForm } from '@angular/forms';
import { Observable, concatMap, forkJoin, of } from 'rxjs';
import { errorMessage } from '../../../core/admin-key.interceptor';
import { AdminApiService } from '../../../core/api.service';
import { CATEGORIES, Category, PlayerRequest, PlayerRow, PlayerStatus, TeamRow, categoryLabel } from '../../../core/models';
import { ImagePicker } from '../../../shared/image-picker';
import { MoneyPipe } from '../../../shared/money.pipe';

interface PlayerForm {
  name: string;
  category: Category | null;
  basePrice: number | null;
  matches: number | null;
  runs: number | null;
  wickets: number | null;
  style: string;
  info: string;
  retainedTeamId: number | null;
  retentionPrice: number | null;
}

type StatusFilter = 'All' | PlayerStatus;

/** Wireframe 5: add, edit and delete the players of one auction, one at a time, with a photo and retention. */
@Component({
  selector: 'app-players-page',
  imports: [FormsModule, MoneyPipe, ImagePicker],
  templateUrl: './players-page.html',
  styleUrl: './players-page.scss',
})
export class PlayersPage {
  private admin = inject(AdminApiService);

  readonly auctionIdParam = input.required<string>({ alias: 'auctionId' });
  private auctionId = computed(() => Number(this.auctionIdParam()));

  protected readonly categories = CATEGORIES;
  protected readonly categoryLabel = categoryLabel;
  protected readonly statuses: StatusFilter[] = ['All', 'Available', 'Retained', 'Sold', 'Unsold'];
  protected readonly styles = [
    'Right hand bat',
    'Left hand bat',
    'Right arm fast',
    'Right arm medium',
    'Right arm spin',
    'Left arm fast',
    'Left arm medium',
    'Left arm spin',
    'Wicket keeper',
  ];

  protected players = signal<PlayerRow[]>([]);
  protected teams = signal<TeamRow[]>([]);
  protected loading = signal(true);
  protected loadError = signal<string | null>(null);

  // ---------- list filters and summary ----------

  protected search = signal('');
  protected categoryFilter = signal<Category | 'All'>('All');
  protected statusFilter = signal<StatusFilter>('All');

  protected filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const cat = this.categoryFilter();
    const status = this.statusFilter();
    return this.players().filter(
      (p) =>
        (cat === 'All' || p.category === cat) &&
        (status === 'All' || p.status === status) &&
        (!q || p.name.toLowerCase().includes(q) || p.style.toLowerCase().includes(q)),
    );
  });

  protected summary = computed(() => {
    const list = this.players();
    const count = (s: PlayerStatus) => list.filter((p) => p.status === s).length;
    const retained = count('Retained');
    return {
      total: list.length,
      retained,
      pool: list.length - retained,
      available: count('Available'),
      sold: count('Sold'),
      unsold: count('Unsold'),
    };
  });

  // ---------- form ----------

  /** Player being edited, or null when adding. */
  protected editing = signal<PlayerRow | null>(null);
  /** Category and base price carry over to the next new player, to speed up entering a list. */
  private carry: Pick<PlayerForm, 'category' | 'basePrice'> = { category: null, basePrice: null };
  protected form: PlayerForm = this.blank();

  protected photoFile = signal<File | null>(null);
  protected removePhoto = signal(false);

  protected saving = signal(false);
  protected formError = signal<string | null>(null);
  protected notice = signal<string | null>(null);

  protected confirmDelete = signal<PlayerRow | null>(null);
  protected listError = signal<string | null>(null);

  /** Wallet and squad room for the team picked as the retaining team. */
  protected retainingTeam = signal<TeamRow | null>(null);

  constructor() {
    effect(() => {
      const id = this.auctionId();
      this.loading.set(true);
      forkJoin([this.admin.players(id), this.admin.teams(id)]).subscribe({
        next: ([players, teams]) => {
          this.players.set(players);
          this.teams.set(teams);
          this.loading.set(false);
        },
        error: (e) => {
          this.loadError.set(errorMessage(e));
          this.loading.set(false);
        },
      });
    });
  }

  startAdd(form?: NgForm) {
    this.editing.set(null);
    this.form = this.blank();
    this.retainingTeam.set(null);
    this.resetPhoto();
    this.formError.set(null);
    // Values follow the bindings; only clear the touched marks.
    form?.control.markAsUntouched();
    form?.control.markAsPristine();
  }

  startEdit(p: PlayerRow, form?: NgForm) {
    this.editing.set(p);
    this.form = {
      name: p.name,
      category: p.category,
      basePrice: p.basePrice,
      matches: p.matches,
      runs: p.runs,
      wickets: p.wickets,
      style: p.style,
      info: p.info,
      retainedTeamId: p.retainedTeamId,
      retentionPrice: p.retentionPrice,
    };
    this.teamPicked(p.retainedTeamId);
    this.resetPhoto();
    this.formError.set(null);
    this.notice.set(null);
    this.confirmDelete.set(null);
    form?.control.markAsUntouched();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  teamPicked(teamId: number | null) {
    this.form.retainedTeamId = teamId;
    if (teamId === null) this.form.retentionPrice = null;
    this.retainingTeam.set(this.teams().find((t) => t.id === teamId) ?? null);
  }

  save(form: NgForm) {
    if (form.invalid || !this.form.category) {
      form.control.markAllAsTouched();
      this.formError.set('Fill in the required fields.');
      return;
    }
    const auctionId = this.auctionId();
    const editing = this.editing();
    const body: PlayerRequest = {
      name: this.form.name.trim(),
      category: this.form.category,
      basePrice: this.form.basePrice ?? 0,
      matches: this.form.matches ?? 0,
      runs: this.form.runs ?? 0,
      wickets: this.form.wickets ?? 0,
      style: this.form.style.trim(),
      info: this.form.info.trim(),
      retainedTeamId: this.form.retainedTeamId,
      retentionPrice: this.form.retainedTeamId ? (this.form.retentionPrice ?? 0) : 0,
    };
    const file = this.photoFile();
    const remove = this.removePhoto();

    this.saving.set(true);
    this.formError.set(null);
    this.notice.set(null);

    const savePlayer = editing
      ? this.admin.updatePlayer(auctionId, editing.id, body)
      : this.admin.createPlayer(auctionId, body);
    let playerSaved: PlayerRow | null = null;

    savePlayer
      .pipe(
        concatMap((p): Observable<PlayerRow> => {
          playerSaved = p;
          if (file) return this.admin.uploadPhoto(auctionId, p.id, file);
          if (remove) return this.admin.removePhoto(auctionId, p.id);
          return of(p);
        }),
      )
      .subscribe({
        next: (p) => {
          this.upsert(p);
          this.refreshTeams();
          this.notice.set(editing ? `${p.name} updated.` : `${p.name} added.`);
          this.saving.set(false);
          if (!editing) this.carry = { category: body.category, basePrice: body.basePrice };
          this.startAdd(form);
        },
        error: (e) => {
          this.saving.set(false);
          if (playerSaved) {
            // The player was saved; only the photo step failed. Keep editing so the admin can retry.
            this.upsert(playerSaved);
            this.editing.set(playerSaved);
            this.formError.set(`Player saved, but the photo could not be updated: ${errorMessage(e)}`);
          } else {
            this.formError.set(errorMessage(e));
          }
        },
      });
  }

  askDelete(p: PlayerRow) {
    this.listError.set(null);
    this.confirmDelete.set(p);
  }

  remove(p: PlayerRow) {
    this.admin.deletePlayer(this.auctionId(), p.id).subscribe({
      next: () => {
        this.players.update((list) => list.filter((x) => x.id !== p.id));
        this.confirmDelete.set(null);
        if (this.editing()?.id === p.id) this.startAdd();
        if (p.status === 'Retained') this.refreshTeams();
        this.notice.set(`${p.name} deleted.`);
      },
      error: (e) => {
        this.confirmDelete.set(null);
        this.listError.set(errorMessage(e));
      },
    });
  }

  clearFilters() {
    this.search.set('');
    this.categoryFilter.set('All');
    this.statusFilter.set('All');
  }

  private blank(): PlayerForm {
    return {
      name: '',
      category: this.carry.category,
      basePrice: this.carry.basePrice,
      matches: null,
      runs: null,
      wickets: null,
      style: '',
      info: '',
      retainedTeamId: null,
      retentionPrice: null,
    };
  }

  private upsert(p: PlayerRow) {
    this.players.update((list) =>
      list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [...list, p],
    );
  }

  /** Retaining changes a team's wallet and squad, so the team picker's numbers need refreshing. */
  private refreshTeams() {
    this.admin.teams(this.auctionId()).subscribe((teams) => this.teams.set(teams));
  }

  private resetPhoto() {
    this.photoFile.set(null);
    this.removePhoto.set(false);
  }
}

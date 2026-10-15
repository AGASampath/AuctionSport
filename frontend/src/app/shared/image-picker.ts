import { Component, computed, effect, input, model, output, signal } from '@angular/core';

const MAX_BYTES = 5 * 1024 * 1024;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Image box with choose / change / remove, used for team logos and player photos.
 * Nothing is uploaded here: the parent reads `file` (new image) and `removed` (drop the saved one) when it saves.
 */
@Component({
  selector: 'app-image-picker',
  template: `
    <div class="picker">
      <div class="box" [class.round]="round()">
        @if (shown(); as src) {
          <img [src]="src" [alt]="noun()" />
        } @else {
          <span>{{ placeholder() || noun() }}</span>
        }
      </div>
      <div class="picker-actions">
        <label class="btn small">
          {{ shown() ? 'Change ' + noun() : 'Choose ' + noun() }}
          <input type="file" accept="image/png,image/jpeg,image/webp" (change)="chosen($event)" hidden />
        </label>
        @if (shown()) {
          <button class="btn small danger-outline" type="button" (click)="remove()">Remove</button>
        }
        <small class="muted">JPG, PNG or WebP, up to 5 MB</small>
      </div>
    </div>
  `,
  styles: `
    .picker {
      display: flex;
      gap: 14px;
      align-items: center;
    }
    .box {
      width: 76px;
      height: 76px;
      flex: none;
      border: 1px dashed #8fa08c;
      border-radius: 12px;
      background: var(--soft);
      display: grid;
      place-items: center;
      overflow: hidden;
      color: #8a998a;
      font-weight: 600;
      font-size: 13px;
      text-align: center;
      &.round {
        border-radius: 50%;
      }
      img {
        width: 100%;
        height: 100%;
        object-fit: cover;
      }
    }
    .picker-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      align-items: center;
      small {
        flex-basis: 100%;
      }
    }
  `,
})
export class ImagePicker {
  /** The saved image, if any. */
  readonly currentUrl = input<string | null>(null);
  /** Word used on the buttons: "logo", "photo". */
  readonly noun = input('image');
  /** Text in the empty box, e.g. the team's short name. */
  readonly placeholder = input('');
  readonly round = input(false);

  /** New image chosen but not uploaded yet. */
  readonly file = model<File | null>(null);
  /** True when the saved image should be deleted on save. */
  readonly removed = model(false);
  readonly error = output<string>();

  private preview = signal<string | null>(null);
  protected shown = computed(() => this.preview() ?? (this.removed() ? null : this.currentUrl()));

  constructor() {
    // Local preview for the chosen file; the object URL is released when the file changes or the picker goes away.
    effect((onCleanup) => {
      const f = this.file();
      if (!f) {
        this.preview.set(null);
        return;
      }
      const url = URL.createObjectURL(f);
      this.preview.set(url);
      onCleanup(() => URL.revokeObjectURL(url));
    });
  }

  chosen(event: Event) {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = ''; // allow choosing the same file again
    if (!f) return;
    if (!TYPES.includes(f.type)) return this.error.emit('Use a JPG, PNG or WebP image.');
    if (f.size > MAX_BYTES) return this.error.emit('The image is larger than 5 MB.');
    this.file.set(f);
    this.removed.set(false);
  }

  remove() {
    this.file.set(null);
    this.removed.set(!!this.currentUrl());
  }
}

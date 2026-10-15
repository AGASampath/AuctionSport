import { Injectable, computed, signal } from '@angular/core';
import { LoginResponse } from './models';

const OWNER_KEY = 'auction.owner';
const ADMIN_KEY = 'auction.adminKey';

// sessionStorage can throw (private mode, blocked storage); the app still works for the current page.
function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null) {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

/** Holds the owner login (token + team) and the admin key for this browser tab. */
@Injectable({ providedIn: 'root' })
export class SessionStore {
  readonly owner = signal<LoginResponse | null>(JSON.parse(read(OWNER_KEY) ?? 'null'));
  readonly adminKey = signal<string | null>(read(ADMIN_KEY));

  readonly isOwner = computed(() => this.owner() !== null);
  readonly isAdmin = computed(() => !!this.adminKey());

  setOwner(login: LoginResponse | null) {
    this.owner.set(login);
    write(OWNER_KEY, login ? JSON.stringify(login) : null);
  }

  setAdminKey(key: string | null) {
    this.adminKey.set(key);
    write(ADMIN_KEY, key);
  }
}

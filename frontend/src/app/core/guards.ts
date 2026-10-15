import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { SessionStore } from './session.store';

export const ownerGuard: CanActivateFn = () =>
  inject(SessionStore).isOwner() || inject(Router).createUrlTree(['/login']);

export const adminGuard: CanActivateFn = () =>
  inject(SessionStore).isAdmin() || inject(Router).createUrlTree(['/admin/login']);

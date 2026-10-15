import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { SessionStore } from './session.store';

/** Adds X-Admin-Key to /api/admin calls and sends the admin back to the key screen on 401. */
export const adminKeyInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith('/api/admin')) return next(req);

  const session = inject(SessionStore);
  const router = inject(Router);
  const key = session.adminKey();
  const authed = key ? req.clone({ setHeaders: { 'X-Admin-Key': key } }) : req;

  return next(authed).pipe(
    catchError((err: HttpErrorResponse) => {
      if (err.status === 401) {
        session.setAdminKey(null);
        router.navigate(['/admin/login']);
      }
      return throwError(() => err);
    }),
  );
};

/** Pulls the backend's { error } message out of a failed request. */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'Cannot reach the server.';
    return err.error?.error ?? err.message;
  }
  return String(err);
}

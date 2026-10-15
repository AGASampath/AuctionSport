import { Routes } from '@angular/router';
import { adminGuard, ownerGuard } from './core/guards';

// Screens follow docs/wireframes.html. Routes using `placeholder` are not built yet.
const placeholder = () => import('./shared/placeholder-page').then((m) => m.PlaceholderPage);
const auctionForm = () => import('./features/admin/auctions/auction-form').then((m) => m.AuctionForm);

export const routes: Routes = [
  { path: '', loadComponent: () => import('./features/home/home-page').then((m) => m.HomePage), title: 'Player auction' },

  // Owner (phone)
  { path: 'login', loadComponent: () => import('./features/owner/owner-login').then((m) => m.OwnerLogin), title: 'Owner login' },
  { path: 'bid', canActivate: [ownerGuard], loadComponent: placeholder, title: 'Bidding', data: { heading: 'Owner bidding', wireframe: 2 } },

  // Big screen (projector)
  { path: 'screen', loadComponent: () => import('./features/screen/screen-picker').then((m) => m.ScreenPicker), title: 'Big screen' },
  { path: 'screen/:auctionId', loadComponent: placeholder, title: 'Big screen', data: { heading: 'Big screen', wireframe: 3 } },

  // Admin (laptop): auction list, then everything inside one auction
  { path: 'admin/login', loadComponent: () => import('./features/admin/admin-login').then((m) => m.AdminLogin), title: 'Admin login' },
  {
    path: 'admin',
    canActivate: [adminGuard],
    loadComponent: () => import('./features/admin/admin-layout').then((m) => m.AdminLayout),
    children: [
      { path: '', loadComponent: () => import('./features/admin/auctions/auction-list').then((m) => m.AuctionList), title: 'Auctions' },
      { path: 'auctions/new', loadComponent: auctionForm, title: 'New auction' },
      { path: 'auctions/:auctionId/edit', loadComponent: auctionForm, title: 'Edit auction' },
      {
        path: 'auctions/:auctionId',
        loadComponent: () => import('./features/admin/workspace/auction-workspace').then((m) => m.AuctionWorkspace),
        children: [
          { path: '', pathMatch: 'full', redirectTo: 'config' },
          { path: 'config', loadComponent: () => import('./features/admin/workspace/config-page').then((m) => m.ConfigPage), title: 'Configuration' },
          { path: 'teams', loadComponent: () => import('./features/admin/workspace/teams-page').then((m) => m.TeamsPage), title: 'Teams' },
          { path: 'players', loadComponent: () => import('./features/admin/workspace/players-page').then((m) => m.PlayersPage), title: 'Players' },
          { path: 'live', loadComponent: placeholder, title: 'Live control', data: { heading: 'Live control', wireframe: 7 } },
          { path: 'reports', loadComponent: placeholder, title: 'Reports', data: { heading: 'Reports', wireframe: 8 } },
        ],
      },
    ],
  },

  { path: '**', redirectTo: '' },
];

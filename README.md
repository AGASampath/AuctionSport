# Cricket player auction

Backend (.NET + SignalR + SQLite) and Angular frontend. The app holds many auctions (for example "001 - BPL"). Teams, players, configuration and sales belong to one auction.

## Run on your laptop
1. Install the .NET SDK (latest LTS). If it is not .NET 10, change `TargetFramework` in `backend/AuctionApp.csproj` (for example `net9.0`) and the `Version="10.0.*"` package line to match.
2. Open a terminal in `backend` and run:

       dotnet run

3. Start the frontend (see below) and open http://localhost:4200/admin. Log in with the admin key (set in `appsettings.json`, default `change-me`).
4. Create an auction (for example code `001`, name `BPL`) and set its status to Live when owners should be able to log in.

If phones cannot connect, allow port 5000 through Windows Firewall (Private network).

### Backend test page
http://localhost:5000/test.html still works for quick checks. Enter the auction ID (the number, not the code), the admin key, and press "Load demo data" to add 10 teams (PINs 1001 to 1010) and 40 players to that auction.

## What exists
- Auctions with their teams, players, config and sales saved in SQLite (`backend/AppData/auction.db`)
- Auction engine: one live session per auction. Random pick by category, bidding with purse and squad checks, confirm timer, pause and resume, undo last sale, mark sold or unsold, round 2 for unsold players
- SignalR hub at `/hub/auction`. Owners connect with `?token=` from login, while the admin and big screen use `?auctionId=`. Each auction's screens get only that auction's state.
- REST API:
  - Public: `GET /api/auctions` (live auctions), `GET /api/auctions/{id}/state`, `GET /api/auctions/{id}/teams`, `POST /api/login`
  - Admin (header `X-Admin-Key`): `/api/admin/auctions` (list, create), `/api/admin/auctions/{id}` (get, edit, delete)
  - Inside one auction: `/api/admin/auctions/{id}/...` with teams, players, config, live controls, reports, seed-demo

The database is created with `EnsureCreated`, which does not upgrade an existing file. After a model change, move `AppData/auction.db` aside and restart. The pre-auction database was saved as `AppData/auction.db.bak-20261014`.

## Frontend (Angular)
Angular 22 app in `frontend`. Needs Node.js LTS.

1. Start the backend (`dotnet run` in `backend`).
2. In `frontend` run `npm install` once, then `npm start`.
3. Open http://localhost:4200. The dev server forwards `/api`, `/hub` and `/uploads` to the backend on port 5000 (`proxy.conf.json`).

Layout:
- `src/app/core`: models (match `backend/Models`), `ApiService` and `AdminApiService`, `AuctionHubService` (SignalR live state and the countdown from server time), session store, guards, admin key interceptor
- `src/app/features/admin`: admin key login, auction list, auction form (add/edit), auction workspace with the Configuration, Teams and Players pages
- `src/app/features/owner`: login (auction, team, PIN)
- `src/app/features/screen`: big screen auction picker

Routes:
- `/admin` lists auctions. `/admin/auctions/new` and `/admin/auctions/:id/edit` add and edit an auction.
- `/admin/auctions/:id/{config,teams,players,live,reports}` is the workspace for one auction.
- `/login` and `/bid` are for owners. `/screen` and `/screen/:id` are the big screen.

## Not built yet
Angular screens: live control, reports, owner bidding, big screen. Also CSV import, Excel and PDF reports, Docker and cloud deploy files.

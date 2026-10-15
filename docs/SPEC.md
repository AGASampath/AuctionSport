# Cricket player auction: specification summary

A live player auction for a softball cricket tournament, in the style of a franchise league auction.
Ten team owners bid from their phones while a big screen shows the auction live.

## 1. Roles and screens

| Role | Device | Screens |
|---|---|---|
| Admin | Laptop | Setup (teams, players, configuration), live control, reports |
| Team owner (10) | Phone | Login, live bidding |
| Audience | Projector or TV | Big screen (read only) |

Wireframes: `wireframes.html`. Diagrams: `diagrams/` (architecture, use case, bidding flow).

## 1a. Auctions (top level)

The app holds many auctions, each identified by a code and name (for example "001 - BPL").
Teams, players, retained players, configuration, sales and reports all belong to one auction and never mix with another's.

- **Admin home:** the list of auctions with add, edit and delete. Opening an auction leads to its workspace: Configuration, Teams, Players, Live control, Reports.
- **Auction fields:** code (unique), name, date, venue, status.
- **Status:** Draft (being set up, owners cannot log in), Live (owners can log in and bid, shown on the big screen), Completed (finished, kept for reports).
- **Delete:** removes the auction with all its teams, players, sales and configuration. Not allowed while the auction is Live.
- **Owner login and big screen:** list only Live auctions, and skip the choice when exactly one is live.
- Each auction has its own live session. Several can run at the same time, and screens receive only their own auction's updates.

## 2. Before the auction (admin)

- **Teams:** name, short name, logo, owner name, phone, login PIN, wallet (maximum spend), squad size. Add one by one or import a CSV file.
- **Players:** name, photo, category (batting, bowling, all-rounder), base price, matches, runs, wickets, style, other info. Add one by one or import a CSV file.
- **Retained players:** assign a player to a team before the auction. Retained players go straight into that team's squad (with an optional retention price taken from the wallet).
- **Auction pool:** total players minus retained players.
- **Configuration:**
  - Bid buttons (for example 100, 1000, 5000), separately for round 1 and round 2.
  - Confirm wait time (for example 30 seconds after the last bid).
  - Default team wallet, minimum and maximum squad size.
  - Low wallet alert value.
  - Option to keep enough wallet to fill the minimum squad.

## 3. During the auction

**Admin controls:** pick a random player (optionally by category), start bidding, pause, resume, mark sold, mark unsold, cancel the current player, undo the last sale, change configuration, start round 2.

**Owner phone:** sees the current player (photo, category, base price, stats), the current bid, who holds it, the timer, own purse and squad count. Taps a button to raise the bid by that amount.

**Big screen:** shows the current player, the live bid and holder, the timer, the last sale, and all ten teams' remaining purse and squad count. Teams below the low wallet alert are flagged.

### Bidding rules

1. The first bid is at the base price ("Bid base price" button), or the base price plus a button amount.
2. Each later tap adds the button amount to the current bid.
3. A bid is rejected if it exceeds the owner's remaining purse, the squad is full, the owner already holds the top bid, the auction is paused, or it would leave too little purse to fill the minimum squad (when that option is on).
4. The confirm timer restarts on every bid. When it runs out, the player is sold to the top bidder.
5. On a sale the team's purse is reduced and the player joins that team's squad.
6. If nobody bids, the admin marks the player unsold.
7. When round 1 has no players left, round 2 starts with the unsold players only.
8. Undo returns the last sold player to the pool and refunds the team.
9. The server is the only source of truth for time, price, and purse.

## 4. After the auction

- Team-wise report (players, prices, spent, remaining wallet).
- Sold list.
- Unsold list.

## 5. Technology

| Part | Choice |
|---|---|
| Frontend | Angular (mobile friendly) |
| Backend | ASP.NET Core Web API (.NET 10 LTS) |
| Live updates | SignalR (WebSockets) |
| Database | SQLite for the laptop, PostgreSQL if hosted |
| Files | Local folder for photos and logos (swappable for Azure Blob or AWS S3) |
| Single instance | Live auction state is held in one server's memory and saved after each sale |

## 6. Deployment

- **First: laptop on internal Wi-Fi.** Run the app on the admin laptop with a fixed IP. Owners join the same Wi-Fi and open the laptop's address. Works without internet. Use a dedicated router at the venue and allow the app's port through the firewall.
- **Later: Azure or AWS.** Keep configuration in settings (connection string, uploads path, port), not in code. Publish with `dotnet publish -c Release` and build Angular with `ng build`, then deploy the folders. Docker is optional and can be added later.
- Keep the database file and uploads outside the published folder so a redeploy cannot overwrite them.

## 7. Status

| Item | Status |
|---|---|
| Backend (data, engine, SignalR hub, admin API, test page) | Written, scoped per auction. Runs on the laptop |
| Angular screens | Auction list (add, edit, delete), auction workspace, configuration, teams (add, edit, delete, logo), players (add, edit, delete, photo, retention) and owner login done. Live control, reports, owner bidding and big screen not built yet |
| CSV import | Planned (Angular side) |
| Excel and PDF reports | Planned (JSON reports exist) |
| Docker and cloud deploy files | Planned |

## 8. Open questions

- Do retained players cost money (retention price taken from the wallet), or are they free? The backend supports a retention price, default 0.
- Should bid increments stay fixed, or change as the price climbs?
- Photos for bulk-imported players: matched by file name, or added one by one?

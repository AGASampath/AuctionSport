using AuctionApp.Data;
using AuctionApp.Models;
using AuctionApp.Services;
using Microsoft.EntityFrameworkCore;

namespace AuctionApp;

public static class Api
{
    private static async ValueTask<object?> AdminOnly(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        var key = ctx.HttpContext.RequestServices.GetRequiredService<IConfiguration>()["AdminKey"];
        var sent = ctx.HttpContext.Request.Headers["X-Admin-Key"].ToString();
        if (string.IsNullOrEmpty(key) || sent != key) return Results.Unauthorized();
        return await next(ctx);
    }

    // 404 for any /auctions/{auctionId}/... route whose auction doesn't exist.
    private static async ValueTask<object?> AuctionExists(EndpointFilterInvocationContext ctx, EndpointFilterDelegate next)
    {
        if (!int.TryParse(ctx.HttpContext.Request.RouteValues["auctionId"]?.ToString(), out var id))
            return Results.NotFound();
        var f = ctx.HttpContext.RequestServices.GetRequiredService<IDbContextFactory<AuctionDb>>();
        await using var db = await f.CreateDbContextAsync();
        if (!await db.Auctions.AnyAsync(a => a.Id == id)) return Results.NotFound(new { error = "Auction not found." });
        return await next(ctx);
    }

    private static IResult Result(string? error) =>
        error == null ? Results.Ok() : Results.BadRequest(new { error });

    private static IResult Bad(string error) => Results.BadRequest(new { error });

    private const long MaxImageBytes = 5 * 1024 * 1024;

    private static async Task<string> SaveImage(IFormFile file, string uploads)
    {
        var ext = Path.GetExtension(file.FileName).ToLowerInvariant();
        if (ext is not (".jpg" or ".jpeg" or ".png" or ".webp")) throw new InvalidOperationException("Use a JPG, PNG, or WebP image.");
        if (file.Length > MaxImageBytes) throw new InvalidOperationException("The image is larger than 5 MB.");
        if (file.Length == 0) throw new InvalidOperationException("The image file is empty.");
        var name = Guid.NewGuid().ToString("N") + ext;
        await using var stream = File.Create(Path.Combine(uploads, name));
        await file.CopyToAsync(stream);
        return name;
    }

    private static void DeleteImage(string? name, string uploads)
    {
        if (string.IsNullOrEmpty(name)) return;
        var path = Path.Combine(uploads, Path.GetFileName(name));
        if (File.Exists(path)) File.Delete(path);
    }

    private static string? ValidateAuction(AuctionRequest r)
    {
        if (string.IsNullOrWhiteSpace(r.Code)) return "Enter an auction code, for example 001.";
        if (r.Code.Trim().Length > 20) return "Keep the code to 20 characters or fewer.";
        if (string.IsNullOrWhiteSpace(r.Name)) return "Enter an auction name.";
        if (!Enum.IsDefined(r.Status)) return "Unknown status.";
        return null;
    }

    private static string? Url(string? path) => string.IsNullOrEmpty(path) ? null : "/uploads/" + path;

    // Teams with what they have spent and how many players they hold (bought + retained).
    private static async Task<List<TeamRow>> TeamRows(AuctionDb db, int auctionId, int? onlyId = null)
    {
        var teams = await db.Teams.Where(t => t.AuctionId == auctionId && (onlyId == null || t.Id == onlyId))
            .OrderBy(t => t.Id).ToListAsync();
        var sales = await db.Sales.Where(s => s.AuctionId == auctionId).ToListAsync();
        var retained = await db.Players.Where(p => p.AuctionId == auctionId && p.Status == PlayerStatus.Retained).ToListAsync();
        return teams.Select(t =>
        {
            var spent = sales.Where(s => s.TeamId == t.Id).Sum(s => s.Price)
                        + retained.Where(p => p.RetainedTeamId == t.Id).Sum(p => p.RetentionPrice);
            var players = sales.Count(s => s.TeamId == t.Id) + retained.Count(p => p.RetainedTeamId == t.Id);
            return new TeamRow(t.Id, t.Name, t.ShortName, t.OwnerName, t.Phone, t.Pin, Url(t.LogoPath),
                t.Wallet, t.SquadSize, spent, t.Wallet - spent, players);
        }).ToList();
    }

    // Validates a team form and copies it onto the entity. Returns an error message, or null when valid.
    private static async Task<string?> ApplyTeam(AuctionDb db, Team t, TeamRequest r, AuctionConfig cfg)
    {
        var name = r.Name?.Trim() ?? "";
        var shortName = r.ShortName?.Trim().ToUpperInvariant() ?? "";
        var pin = r.Pin?.Trim() ?? "";

        if (name.Length == 0) return "Enter a team name.";
        if (name.Length > 60) return "Keep the team name to 60 characters or fewer.";
        if (shortName.Length == 0) return "Enter a short name, for example LIO.";
        if (shortName.Length > 6) return "Keep the short name to 6 characters or fewer.";
        if (pin.Length is < 4 or > 6 || !pin.All(char.IsAsciiDigit)) return "The PIN must be 4 to 6 digits.";
        if (r.Wallet < 0) return "The wallet can't be negative.";
        if (r.SquadSize < 0 || r.SquadSize > 50) return "Squad size must be between 1 and 50.";

        var others = db.Teams.Where(x => x.AuctionId == t.AuctionId && x.Id != t.Id);
        var lower = name.ToLower();
        if (await others.AnyAsync(x => x.Name.ToLower() == lower)) return $"A team called {name} already exists in this auction.";
        if (await others.AnyAsync(x => x.ShortName == shortName)) return $"The short name {shortName} is already used.";
        if (await others.AnyAsync(x => x.Pin == pin)) return "Another team in this auction already has that PIN.";

        t.Name = name;
        t.ShortName = shortName;
        t.OwnerName = r.OwnerName?.Trim() ?? "";
        t.Phone = r.Phone?.Trim() ?? "";
        t.Pin = pin;
        t.Wallet = r.Wallet > 0 ? r.Wallet : cfg.DefaultWallet;     // 0 means "use the auction default"
        t.SquadSize = r.SquadSize > 0 ? r.SquadSize : cfg.MaxSquad;
        return null;
    }

    private static readonly string[] Categories = ["Batting", "Bowling", "AllRounder"];

    // Players with the retaining team or the buyer filled in.
    private static async Task<List<PlayerRow>> PlayerRows(AuctionDb db, int auctionId, int? onlyId = null)
    {
        var players = await db.Players.Where(p => p.AuctionId == auctionId && (onlyId == null || p.Id == onlyId))
            .OrderBy(p => p.Id).ToListAsync();
        var teams = await db.Teams.Where(t => t.AuctionId == auctionId).ToDictionaryAsync(t => t.Id, t => t.Name);
        var sales = await db.Sales.Where(s => s.AuctionId == auctionId).ToDictionaryAsync(s => s.PlayerId);
        return players.Select(p =>
        {
            sales.TryGetValue(p.Id, out var sale);
            return new PlayerRow(p.Id, p.Name, p.Category, p.BasePrice, p.Matches, p.Runs, p.Wickets, p.Style, p.Info,
                Url(p.PhotoPath), p.Status,
                p.RetainedTeamId, p.RetainedTeamId is { } rt ? teams.GetValueOrDefault(rt) : null, p.RetentionPrice,
                sale == null ? null : teams.GetValueOrDefault(sale.TeamId), sale?.Price);
        }).ToList();
    }

    // Validates a player form and copies it onto the entity. Returns an error message, or null when valid.
    private static async Task<string?> ApplyPlayer(AuctionDb db, Player p, PlayerRequest r)
    {
        var name = r.Name?.Trim() ?? "";
        if (name.Length == 0) return "Enter the player's name.";
        if (name.Length > 80) return "Keep the name to 80 characters or fewer.";
        if (!Categories.Contains(r.Category)) return "Choose a category: batting, bowling or all-rounder.";
        if (r.BasePrice < 0) return "The base price can't be negative.";
        if (r.Matches < 0 || r.Runs < 0 || r.Wickets < 0) return "Matches, runs and wickets can't be negative.";
        if (r.RetentionPrice < 0) return "The retention price can't be negative.";

        var lower = name.ToLower();
        if (await db.Players.AnyAsync(x => x.AuctionId == p.AuctionId && x.Id != p.Id && x.Name.ToLower() == lower))
            return $"A player called {name} already exists in this auction. Add an initial to tell them apart.";

        if (r.RetainedTeamId is { } teamId)
        {
            var team = await db.Teams.FirstOrDefaultAsync(t => t.Id == teamId && t.AuctionId == p.AuctionId);
            if (team == null) return "The retaining team isn't in this auction.";

            // The retained player takes a squad place and the retention price comes out of the wallet.
            // Leave this player's own current retention out of the totals so editing doesn't count it twice.
            var others = db.Players.Where(x => x.Id != p.Id && x.Status == PlayerStatus.Retained && x.RetainedTeamId == teamId);
            var squad = await db.Sales.CountAsync(s => s.TeamId == teamId) + await others.CountAsync();
            var spent = await db.Sales.Where(s => s.TeamId == teamId).SumAsync(s => s.Price)
                        + (await others.Select(x => x.RetentionPrice).ToListAsync()).Sum();
            if (squad + 1 > team.SquadSize) return $"{team.Name}'s squad is full ({team.SquadSize} players).";
            if (spent + r.RetentionPrice > team.Wallet)
                return $"{team.Name} has only {team.Wallet - spent:N0} left in the wallet.";
        }

        p.Name = name;
        p.Category = r.Category;
        p.BasePrice = r.BasePrice;
        p.Matches = r.Matches;
        p.Runs = r.Runs;
        p.Wickets = r.Wickets;
        p.Style = r.Style?.Trim() ?? "";
        p.Info = r.Info?.Trim() ?? "";
        p.RetainedTeamId = r.RetainedTeamId;
        p.RetentionPrice = r.RetainedTeamId == null ? 0 : r.RetentionPrice;
        if (r.RetainedTeamId != null) p.Status = PlayerStatus.Retained;
        else if (p.Status == PlayerStatus.Retained) p.Status = PlayerStatus.Available;
        return null;
    }

    public static void MapApi(this WebApplication app, string uploads)
    {
        var api = app.MapGroup("/api");

        // ---- public ----

        // Auctions open for bidding (owner login and big screen pick from these).
        api.MapGet("/auctions", async (IDbContextFactory<AuctionDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            return await db.Auctions.Where(a => a.Status == AuctionStatus.Live).OrderBy(a => a.Code)
                .Select(a => new { a.Id, a.Code, a.Name, a.Venue, a.AuctionDate }).ToListAsync();
        });

        api.MapGet("/auctions/{auctionId:int}/state", async (int auctionId, AuctionEngine e) =>
            await e.GetState(auctionId) is { } state ? Results.Ok(state) : Results.NotFound());

        api.MapGet("/auctions/{auctionId:int}/teams", async (int auctionId, IDbContextFactory<AuctionDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            return await db.Teams.Where(t => t.AuctionId == auctionId).OrderBy(t => t.Id)
                .Select(t => new { t.Id, t.Name, t.ShortName, t.LogoPath }).ToListAsync();
        });

        api.MapPost("/login", async (LoginRequest r, IDbContextFactory<AuctionDb> f, SessionStore sessions) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var team = await db.Teams.FindAsync(r.TeamId);
            if (team == null || team.Pin != r.Pin) return Bad("Wrong team or PIN.");
            var auction = await db.Auctions.FindAsync(team.AuctionId);
            if (auction?.Status != AuctionStatus.Live) return Bad("This auction isn't open for bidding.");
            return Results.Ok(new
            {
                token = sessions.Create(team.Id, team.AuctionId),
                teamId = team.Id, teamName = team.Name,
                auctionId = auction.Id, auctionName = $"{auction.Code} - {auction.Name}"
            });
        });

        // ---- admin ----
        var admin = api.MapGroup("/admin");
        admin.AddEndpointFilter(AdminOnly);

        // auctions
        admin.MapGet("/auctions", async (IDbContextFactory<AuctionDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            return await db.Auctions.OrderBy(a => a.Code).Select(a => new AuctionSummary(
                a.Id, a.Code, a.Name, a.Venue, a.AuctionDate, a.Status, a.CreatedUtc,
                db.Teams.Count(t => t.AuctionId == a.Id),
                db.Players.Count(p => p.AuctionId == a.Id),
                db.Sales.Count(s => s.AuctionId == a.Id))).ToListAsync();
        });
        admin.MapGet("/auctions/{auctionId:int}", async (int auctionId, IDbContextFactory<AuctionDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var a = await db.Auctions.FindAsync(auctionId);
            return a == null ? Results.NotFound() : Results.Ok(a);
        });
        admin.MapPost("/auctions", async (AuctionRequest r, IDbContextFactory<AuctionDb> f) =>
        {
            if (ValidateAuction(r) is { } error) return Bad(error);
            await using var db = await f.CreateDbContextAsync();
            var code = r.Code.Trim();
            if (await db.Auctions.AnyAsync(a => a.Code == code)) return Bad($"Auction code {code} is already used.");
            var a = new Auction
            {
                Code = code, Name = r.Name.Trim(), Venue = r.Venue?.Trim() ?? "",
                AuctionDate = r.AuctionDate, Status = r.Status, CreatedUtc = DateTime.UtcNow
            };
            db.Auctions.Add(a);
            await db.SaveChangesAsync();
            db.Configs.Add(new AuctionConfig { AuctionId = a.Id });
            await db.SaveChangesAsync();
            return Results.Ok(a);
        });
        admin.MapPut("/auctions/{auctionId:int}", async (int auctionId, AuctionRequest r, IDbContextFactory<AuctionDb> f, AuctionEngine e) =>
        {
            if (ValidateAuction(r) is { } error) return Bad(error);
            await using var db = await f.CreateDbContextAsync();
            var a = await db.Auctions.FindAsync(auctionId);
            if (a == null) return Results.NotFound();
            var code = r.Code.Trim();
            if (await db.Auctions.AnyAsync(x => x.Code == code && x.Id != auctionId)) return Bad($"Auction code {code} is already used.");
            a.Code = code; a.Name = r.Name.Trim(); a.Venue = r.Venue?.Trim() ?? "";
            a.AuctionDate = r.AuctionDate; a.Status = r.Status;
            await db.SaveChangesAsync();
            await e.BroadcastAsync(auctionId);
            return Results.Ok(a);
        });
        admin.MapDelete("/auctions/{auctionId:int}", async (int auctionId, IDbContextFactory<AuctionDb> f, AuctionEngine e, SessionStore sessions) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var a = await db.Auctions.FindAsync(auctionId);
            if (a == null) return Results.NotFound();
            if (a.Status == AuctionStatus.Live) return Bad("This auction is live. Set it to Draft or Completed before deleting it.");
            if (e.IsBusy(auctionId)) return Bad("A player is on the block. Finish or cancel it first.");

            var images = await db.Teams.Where(t => t.AuctionId == auctionId).Select(t => t.LogoPath)
                .Concat(db.Players.Where(p => p.AuctionId == auctionId).Select(p => p.PhotoPath)).ToListAsync();
            db.Auctions.Remove(a);   // teams, players, sales and config cascade
            await db.SaveChangesAsync();
            foreach (var img in images) DeleteImage(img, uploads);
            sessions.RemoveWhere(s => s.AuctionId == auctionId);
            e.Forget(auctionId);
            return Results.Ok();
        });

        // everything below belongs to one auction
        var one = admin.MapGroup("/auctions/{auctionId:int}");
        one.AddEndpointFilter(AuctionExists);

        // teams
        one.MapGet("/teams", async (int auctionId, IDbContextFactory<AuctionDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            return await TeamRows(db, auctionId);
        });
        one.MapPost("/teams", async (int auctionId, TeamRequest r, IDbContextFactory<AuctionDb> f, AuctionEngine e) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var cfg = await AuctionEngine.GetConfig(db, auctionId);
            var t = new Team { AuctionId = auctionId };
            if (await ApplyTeam(db, t, r, cfg) is { } error) return Bad(error);
            db.Teams.Add(t);
            await db.SaveChangesAsync();
            await e.BroadcastAsync(auctionId);
            return Results.Ok((await TeamRows(db, auctionId, t.Id)).Single());
        });
        one.MapPut("/teams/{id:int}", async (int auctionId, int id, TeamRequest r, IDbContextFactory<AuctionDb> f, AuctionEngine e) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var x = await db.Teams.FirstOrDefaultAsync(x => x.Id == id && x.AuctionId == auctionId);
            if (x == null) return Results.NotFound();
            var cfg = await AuctionEngine.GetConfig(db, auctionId);
            if (await ApplyTeam(db, x, r, cfg) is { } error) return Bad(error);

            var row = (await TeamRows(db, auctionId, id)).Single();
            if (x.Wallet < row.Spent) return Bad($"Wallet can't be less than the {row.Spent:N0} already spent.");
            if (x.SquadSize < row.Players) return Bad($"Squad size can't be less than the {row.Players} players already in the squad.");

            await db.SaveChangesAsync();
            await e.BroadcastAsync(auctionId);
            return Results.Ok((await TeamRows(db, auctionId, id)).Single());
        });
        one.MapDelete("/teams/{id:int}", async (int auctionId, int id, IDbContextFactory<AuctionDb> f, AuctionEngine e, SessionStore sessions) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var x = await db.Teams.FirstOrDefaultAsync(x => x.Id == id && x.AuctionId == auctionId);
            if (x == null) return Results.NotFound();
            if (e.IsBusy(auctionId)) return Bad("A player is on the block. Finish or cancel it first.");
            if (await db.Sales.AnyAsync(s => s.TeamId == id)) return Bad("This team already has purchases.");
            if (await db.Players.AnyAsync(p => p.RetainedTeamId == id)) return Bad("This team has retained players. Remove them first.");
            db.Teams.Remove(x);
            await db.SaveChangesAsync();
            DeleteImage(x.LogoPath, uploads);
            sessions.RemoveWhere(s => s.TeamId == id);
            await e.BroadcastAsync(auctionId);
            return Results.Ok();
        });
        one.MapPost("/teams/{id:int}/logo", async (int auctionId, int id, IFormFile file, IDbContextFactory<AuctionDb> f, AuctionEngine e) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var x = await db.Teams.FirstOrDefaultAsync(x => x.Id == id && x.AuctionId == auctionId);
            if (x == null) return Results.NotFound();
            var old = x.LogoPath;
            try { x.LogoPath = await SaveImage(file, uploads); }
            catch (InvalidOperationException ex) { return Bad(ex.Message); }
            await db.SaveChangesAsync();
            DeleteImage(old, uploads);
            await e.BroadcastAsync(auctionId);
            return Results.Ok((await TeamRows(db, auctionId, id)).Single());
        }).DisableAntiforgery();
        one.MapDelete("/teams/{id:int}/logo", async (int auctionId, int id, IDbContextFactory<AuctionDb> f, AuctionEngine e) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var x = await db.Teams.FirstOrDefaultAsync(x => x.Id == id && x.AuctionId == auctionId);
            if (x == null) return Results.NotFound();
            var old = x.LogoPath;
            x.LogoPath = null;
            await db.SaveChangesAsync();
            DeleteImage(old, uploads);
            await e.BroadcastAsync(auctionId);
            return Results.Ok((await TeamRows(db, auctionId, id)).Single());
        });

        // players
        one.MapGet("/players", async (int auctionId, IDbContextFactory<AuctionDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            return await PlayerRows(db, auctionId);
        });
        one.MapPost("/players", async (int auctionId, PlayerRequest r, IDbContextFactory<AuctionDb> f, AuctionEngine e) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var p = new Player { AuctionId = auctionId };
            if (await ApplyPlayer(db, p, r) is { } error) return Bad(error);
            db.Players.Add(p);
            await db.SaveChangesAsync();
            await e.BroadcastAsync(auctionId);
            return Results.Ok((await PlayerRows(db, auctionId, p.Id)).Single());
        });
        one.MapPut("/players/{id:int}", async (int auctionId, int id, PlayerRequest r, IDbContextFactory<AuctionDb> f, AuctionEngine e) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var x = await db.Players.FirstOrDefaultAsync(x => x.Id == id && x.AuctionId == auctionId);
            if (x == null) return Results.NotFound();
            if (x.Status is PlayerStatus.Sold) return Bad("This player is already sold. Undo the sale to change them.");
            if (e.CurrentPlayerId(auctionId) == id) return Bad("This player is on the block right now.");
            if (await ApplyPlayer(db, x, r) is { } error) return Bad(error);
            await db.SaveChangesAsync();
            await e.BroadcastAsync(auctionId);
            return Results.Ok((await PlayerRows(db, auctionId, id)).Single());
        });
        one.MapDelete("/players/{id:int}", async (int auctionId, int id, IDbContextFactory<AuctionDb> f, AuctionEngine e) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var x = await db.Players.FirstOrDefaultAsync(x => x.Id == id && x.AuctionId == auctionId);
            if (x == null) return Results.NotFound();
            if (await db.Sales.AnyAsync(s => s.PlayerId == id)) return Bad("This player is already sold.");
            if (e.CurrentPlayerId(auctionId) == id) return Bad("This player is on the block right now.");
            db.Players.Remove(x);
            await db.SaveChangesAsync();
            DeleteImage(x.PhotoPath, uploads);
            await e.BroadcastAsync(auctionId);
            return Results.Ok();
        });
        one.MapPost("/players/{id:int}/photo", async (int auctionId, int id, IFormFile file, IDbContextFactory<AuctionDb> f, AuctionEngine e) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var x = await db.Players.FirstOrDefaultAsync(x => x.Id == id && x.AuctionId == auctionId);
            if (x == null) return Results.NotFound();
            var old = x.PhotoPath;
            try { x.PhotoPath = await SaveImage(file, uploads); }
            catch (InvalidOperationException ex) { return Bad(ex.Message); }
            await db.SaveChangesAsync();
            DeleteImage(old, uploads);
            await e.BroadcastAsync(auctionId);
            return Results.Ok((await PlayerRows(db, auctionId, id)).Single());
        }).DisableAntiforgery();
        one.MapDelete("/players/{id:int}/photo", async (int auctionId, int id, IDbContextFactory<AuctionDb> f, AuctionEngine e) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var x = await db.Players.FirstOrDefaultAsync(x => x.Id == id && x.AuctionId == auctionId);
            if (x == null) return Results.NotFound();
            var old = x.PhotoPath;
            x.PhotoPath = null;
            await db.SaveChangesAsync();
            DeleteImage(old, uploads);
            await e.BroadcastAsync(auctionId);
            return Results.Ok((await PlayerRows(db, auctionId, id)).Single());
        });

        // configuration
        one.MapGet("/config", async (int auctionId, IDbContextFactory<AuctionDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            return await AuctionEngine.GetConfig(db, auctionId);
        });
        one.MapPut("/config", async (int auctionId, AuctionConfig c, IDbContextFactory<AuctionDb> f, AuctionEngine e) =>
        {
            if (c.MinSquad < 0 || c.MaxSquad < 1 || c.MinSquad > c.MaxSquad)
                return Bad("Minimum squad size must be between 0 and the maximum squad size.");
            if (c.DefaultWallet < 0 || c.LowWalletAlert < 0) return Bad("Amounts can't be negative.");
            await using var db = await f.CreateDbContextAsync();
            var x = await AuctionEngine.GetConfig(db, auctionId);
            x.BidIncrements = c.BidIncrements; x.Round2Increments = c.Round2Increments;
            x.ConfirmSeconds = Math.Max(5, c.ConfirmSeconds); x.DefaultWallet = c.DefaultWallet;
            x.MinSquad = c.MinSquad; x.MaxSquad = c.MaxSquad; x.LowWalletAlert = c.LowWalletAlert;
            x.ReserveForMinSquad = c.ReserveForMinSquad;
            await db.SaveChangesAsync();
            await e.BroadcastAsync(auctionId);
            return Results.Ok(x);
        });

        // live controls
        one.MapPost("/pick", async (int auctionId, PickRequest r, AuctionEngine e) => Result(await e.Pick(auctionId, r.Category)));
        one.MapPost("/start", async (int auctionId, AuctionEngine e) => Result(await e.Start(auctionId)));
        one.MapPost("/pause", async (int auctionId, AuctionEngine e) => Result(await e.Pause(auctionId)));
        one.MapPost("/resume", async (int auctionId, AuctionEngine e) => Result(await e.Resume(auctionId)));
        one.MapPost("/sold", async (int auctionId, AuctionEngine e) => Result(await e.MarkSold(auctionId)));
        one.MapPost("/unsold", async (int auctionId, AuctionEngine e) => Result(await e.MarkUnsold(auctionId)));
        one.MapPost("/cancel", async (int auctionId, AuctionEngine e) => Result(await e.CancelCurrent(auctionId)));
        one.MapPost("/undo", async (int auctionId, AuctionEngine e) => Result(await e.UndoLastSale(auctionId)));
        one.MapPost("/round2", async (int auctionId, AuctionEngine e) => Result(await e.StartRound2(auctionId)));

        // reports (JSON for now; Excel and PDF come later)
        one.MapGet("/reports/sold", async (int auctionId, IDbContextFactory<AuctionDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var sales = await db.Sales.Where(s => s.AuctionId == auctionId).OrderBy(s => s.Id).ToListAsync();
            var players = await db.Players.Where(p => p.AuctionId == auctionId).ToDictionaryAsync(p => p.Id);
            var teams = await db.Teams.Where(t => t.AuctionId == auctionId).ToDictionaryAsync(t => t.Id);
            return sales.Select(s => new
            {
                Player = players[s.PlayerId].Name, Category = players[s.PlayerId].Category,
                Team = teams[s.TeamId].Name, s.Price, s.Round
            });
        });
        one.MapGet("/reports/unsold", async (int auctionId, IDbContextFactory<AuctionDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            return await db.Players.Where(p => p.AuctionId == auctionId && p.Status == PlayerStatus.Unsold)
                .Select(p => new { p.Name, p.Category, p.BasePrice }).ToListAsync();
        });
        one.MapGet("/reports/teams", async (int auctionId, IDbContextFactory<AuctionDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var teams = await db.Teams.Where(t => t.AuctionId == auctionId).ToListAsync();
            var players = await db.Players.Where(p => p.AuctionId == auctionId).ToListAsync();
            var sales = await db.Sales.Where(s => s.AuctionId == auctionId).ToListAsync();
            return teams.Select(t =>
            {
                var rows = players.Where(p => p.Status == PlayerStatus.Retained && p.RetainedTeamId == t.Id)
                    .Select(p => new { p.Name, p.Category, Price = p.RetentionPrice, Retained = true })
                    .Concat(sales.Where(s => s.TeamId == t.Id).Select(s =>
                    {
                        var p = players.First(x => x.Id == s.PlayerId);
                        return new { p.Name, p.Category, Price = s.Price, Retained = false };
                    })).ToList();
                var spent = rows.Sum(r => r.Price);
                return new { t.Id, t.Name, Spent = spent, Left = t.Wallet - spent, Players = rows };
            });
        });

        // demo data so you can test without typing 10 teams and 40 players
        one.MapPost("/seed-demo", async (int auctionId, IDbContextFactory<AuctionDb> f, AuctionEngine e) =>
        {
            await using var db = await f.CreateDbContextAsync();
            if (await db.Teams.AnyAsync(t => t.AuctionId == auctionId) || await db.Players.AnyAsync(p => p.AuctionId == auctionId))
                return Bad("This auction already has teams or players.");
            var cfg = await AuctionEngine.GetConfig(db, auctionId);
            for (var i = 1; i <= 10; i++)
                db.Teams.Add(new Team { AuctionId = auctionId, Name = $"Team {i}", ShortName = $"T{i}", OwnerName = $"Owner {i}", Pin = (1000 + i).ToString(), Wallet = cfg.DefaultWallet, SquadSize = 12 });
            var cats = new[] { "Batting", "Bowling", "AllRounder" };
            for (var i = 1; i <= 40; i++)
                db.Players.Add(new Player
                {
                    AuctionId = auctionId, Name = $"Player {i}", Category = cats[i % 3], BasePrice = 500,
                    Matches = 10 + i, Runs = 100 + i * 7, Wickets = i % 15, Style = i % 2 == 0 ? "Right hand" : "Left hand"
                });
            await db.SaveChangesAsync();
            await e.BroadcastAsync(auctionId);
            return Results.Ok(new { teams = 10, players = 40, pins = "1001 to 1010" });
        });
    }
}

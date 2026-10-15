using System.Collections.Concurrent;
using AuctionApp.Data;
using AuctionApp.Hubs;
using AuctionApp.Models;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace AuctionApp.Services;

public enum Phase { Idle, Ready, Bidding }

// Live state of one auction. Held in memory; sales are saved to the database as they happen.
public class LiveSession
{
    public int AuctionId { get; init; }
    public Phase Phase = Phase.Idle;
    public bool Paused;
    public int? PlayerId;
    public long Bid;
    public int? LeaderId;
    public DateTime? Deadline;
    public double RemainingMs;
    public string? LastSold;

    public void ResetCurrent()
    {
        Phase = Phase.Idle;
        Paused = false;
        PlayerId = null;
        Bid = 0;
        LeaderId = null;
        Deadline = null;
        RemainingMs = 0;
    }
}

// Single source of truth for every live auction. Every change goes through Mutate,
// which takes a lock, saves to the database, then pushes the new state to that auction's screens.
public class AuctionEngine
{
    private readonly IDbContextFactory<AuctionDb> _dbf;
    private readonly IHubContext<AuctionHub> _hub;
    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly ConcurrentDictionary<int, LiveSession> _sessions = new();
    private static readonly Random Rng = new();

    public AuctionEngine(IDbContextFactory<AuctionDb> dbf, IHubContext<AuctionHub> hub)
    {
        _dbf = dbf;
        _hub = hub;
    }

    // ---------- plumbing ----------

    private LiveSession Session(int auctionId) =>
        _sessions.GetOrAdd(auctionId, id => new LiveSession { AuctionId = id });

    private async Task<string?> Mutate(int auctionId, Func<AuctionDb, LiveSession, Task<string?>> action)
    {
        await _gate.WaitAsync();
        try
        {
            await using var db = await _dbf.CreateDbContextAsync();
            if (!await db.Auctions.AnyAsync(a => a.Id == auctionId)) return "Auction not found.";
            var s = Session(auctionId);
            var error = await action(db, s);
            if (error != null) return error;
            var state = await BuildState(db, s);
            await _hub.Clients.Group(AuctionHub.Group(auctionId)).SendAsync("state", state);
            return null;
        }
        finally { _gate.Release(); }
    }

    private Task<string?> Do(int auctionId, Func<LiveSession, string?> action) =>
        Mutate(auctionId, (_, s) => Task.FromResult(action(s)));

    // Null when the auction doesn't exist.
    public async Task<AuctionState?> GetState(int auctionId)
    {
        await _gate.WaitAsync();
        try
        {
            await using var db = await _dbf.CreateDbContextAsync();
            if (!await db.Auctions.AnyAsync(a => a.Id == auctionId)) return null;
            return await BuildState(db, Session(auctionId));
        }
        finally { _gate.Release(); }
    }

    public async Task BroadcastAsync(int auctionId)
    {
        var state = await GetState(auctionId);
        if (state != null) await _hub.Clients.Group(AuctionHub.Group(auctionId)).SendAsync("state", state);
    }

    // True while a player is on the block; the auction can't be deleted then.
    public bool IsBusy(int auctionId) =>
        _sessions.TryGetValue(auctionId, out var s) && s.PlayerId != null;

    public void Forget(int auctionId) => _sessions.TryRemove(auctionId, out _);

    // The player currently on the block, if any. Admin edits to that player are refused.
    public int? CurrentPlayerId(int auctionId) =>
        _sessions.TryGetValue(auctionId, out var s) ? s.PlayerId : null;

    public static async Task<AuctionConfig> GetConfig(AuctionDb db, int auctionId)
    {
        var cfg = await db.Configs.FirstOrDefaultAsync(c => c.AuctionId == auctionId);
        if (cfg == null)
        {
            cfg = new AuctionConfig { AuctionId = auctionId };
            db.Configs.Add(cfg);
            await db.SaveChangesAsync();
        }
        return cfg;
    }

    private static long[] Increments(AuctionConfig cfg)
    {
        var raw = cfg.CurrentRound >= 2 && !string.IsNullOrWhiteSpace(cfg.Round2Increments)
            ? cfg.Round2Increments : cfg.BidIncrements;
        return raw.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => long.TryParse(x, out var v) ? v : 0)
            .Where(v => v > 0).Distinct().OrderBy(v => v).ToArray();
    }

    private static async Task<(long Spent, int Squad)> TeamTotals(AuctionDb db, int teamId)
    {
        var salesSpent = await db.Sales.Where(s => s.TeamId == teamId).SumAsync(s => s.Price);
        var salesCount = await db.Sales.CountAsync(s => s.TeamId == teamId);
        var retained = await db.Players
            .Where(p => p.Status == PlayerStatus.Retained && p.RetainedTeamId == teamId).ToListAsync();
        return (salesSpent + retained.Sum(p => p.RetentionPrice), salesCount + retained.Count);
    }

    // ---------- admin actions ----------

    public Task<string?> Pick(int auctionId, string? category) => Mutate(auctionId, async (db, s) =>
    {
        if (s.Phase == Phase.Bidding && s.LeaderId != null)
            return "Finish the current player first.";

        var query = db.Players.Where(p => p.AuctionId == auctionId && p.Status == PlayerStatus.Available);
        if (!string.IsNullOrWhiteSpace(category) && category != "All")
            query = query.Where(p => p.Category == category);

        var ids = await query.Select(p => p.Id).ToListAsync();
        if (ids.Count == 0) return "No players left in that category.";

        var player = await db.Players.FindAsync(ids[Rng.Next(ids.Count)]);
        s.PlayerId = player!.Id;
        s.Bid = player.BasePrice;
        s.LeaderId = null;
        s.Deadline = null;
        s.Paused = false;
        s.Phase = Phase.Ready;
        return null;
    });

    public Task<string?> Start(int auctionId) => Do(auctionId, s =>
    {
        if (s.Phase != Phase.Ready) return "Pick a player first.";
        s.Phase = Phase.Bidding;
        return null;
    });

    public Task<string?> Pause(int auctionId) => Do(auctionId, s =>
    {
        if (s.Phase != Phase.Bidding || s.Paused) return "Nothing to pause.";
        s.Paused = true;
        s.RemainingMs = s.Deadline == null ? 0 : Math.Max(0, (s.Deadline.Value - DateTime.UtcNow).TotalMilliseconds);
        return null;
    });

    public Task<string?> Resume(int auctionId) => Do(auctionId, s =>
    {
        if (!s.Paused) return "The auction isn't paused.";
        s.Paused = false;
        if (s.Deadline != null) s.Deadline = DateTime.UtcNow.AddMilliseconds(s.RemainingMs);
        return null;
    });

    public Task<string?> MarkSold(int auctionId) => Mutate(auctionId, SellCurrent);

    public Task<string?> MarkUnsold(int auctionId) => Mutate(auctionId, async (db, s) =>
    {
        if (s.PlayerId == null) return "No player is up for auction.";
        var player = await db.Players.FindAsync(s.PlayerId.Value);
        player!.Status = PlayerStatus.Unsold;
        await db.SaveChangesAsync();
        s.LastSold = $"{player.Name} went unsold";
        s.ResetCurrent();
        return null;
    });

    // Puts the current player back in the pool without selling or marking unsold.
    public Task<string?> CancelCurrent(int auctionId) => Do(auctionId, s =>
    {
        if (s.PlayerId == null) return "No player is up for auction.";
        s.ResetCurrent();
        return null;
    });

    public Task<string?> UndoLastSale(int auctionId) => Mutate(auctionId, async (db, s) =>
    {
        if (s.PlayerId != null) return "Cancel the current player before undoing a sale.";
        var last = await db.Sales.Where(x => x.AuctionId == auctionId).OrderByDescending(x => x.Id).FirstOrDefaultAsync();
        if (last == null) return "Nothing to undo.";
        var player = await db.Players.FindAsync(last.PlayerId);
        player!.Status = PlayerStatus.Available;
        db.Sales.Remove(last);
        await db.SaveChangesAsync();
        s.LastSold = $"Undone: {player.Name} is back in the pool";
        return null;
    });

    public Task<string?> StartRound2(int auctionId) => Mutate(auctionId, async (db, s) =>
    {
        if (s.PlayerId != null) return "Finish the current player first.";
        var players = db.Players.Where(p => p.AuctionId == auctionId);
        if (await players.AnyAsync(p => p.Status == PlayerStatus.Available))
            return "Round 1 isn't finished yet.";
        var unsold = await players.Where(p => p.Status == PlayerStatus.Unsold).ToListAsync();
        if (unsold.Count == 0) return "There are no unsold players.";
        foreach (var p in unsold) p.Status = PlayerStatus.Available;
        var cfg = await GetConfig(db, auctionId);
        cfg.CurrentRound = 2;
        await db.SaveChangesAsync();
        s.LastSold = $"Round 2 started with {unsold.Count} unsold players";
        return null;
    });

    private static async Task<string?> SellCurrent(AuctionDb db, LiveSession s)
    {
        if (s.PlayerId == null || s.LeaderId == null) return "There is no bid to confirm.";
        var player = await db.Players.FindAsync(s.PlayerId.Value);
        var team = await db.Teams.FindAsync(s.LeaderId.Value);
        var cfg = await GetConfig(db, s.AuctionId);
        player!.Status = PlayerStatus.Sold;
        db.Sales.Add(new Sale
        {
            AuctionId = s.AuctionId,
            PlayerId = player.Id,
            TeamId = team!.Id,
            Price = s.Bid,
            Round = cfg.CurrentRound,
            SoldAtUtc = DateTime.UtcNow
        });
        await db.SaveChangesAsync();
        s.LastSold = $"{player.Name} sold to {team.Name} for {s.Bid:N0}";
        s.ResetCurrent();
        return null;
    }

    private static bool Due(LiveSession s) =>
        s.Phase == Phase.Bidding && !s.Paused && s.LeaderId != null
        && s.Deadline != null && DateTime.UtcNow >= s.Deadline;

    // Called by the background ticker.
    public async Task TickAsync()
    {
        foreach (var s in _sessions.Values)
        {
            if (!Due(s)) continue;
            await Mutate(s.AuctionId, async (db, live) => Due(live) ? await SellCurrent(db, live) : "not due");
        }
    }

    // ---------- owner action ----------

    public Task<string?> PlaceBid(int auctionId, int teamId, long increment) => Mutate(auctionId, async (db, s) =>
    {
        if (s.Phase != Phase.Bidding) return "Bidding hasn't started.";
        if (s.Paused) return "The auction is paused.";
        if (s.Deadline != null && DateTime.UtcNow >= s.Deadline) return "Time is up for this player.";
        if (s.LeaderId == teamId) return "You already hold the top bid.";

        var cfg = await GetConfig(db, auctionId);
        var allowed = Increments(cfg);

        long newBid;
        if (s.LeaderId == null && increment == 0) newBid = s.Bid;            // opening bid at base price
        else if (allowed.Contains(increment)) newBid = s.Bid + increment;
        else return "That bid amount isn't allowed.";

        var team = await db.Teams.FindAsync(teamId);
        if (team == null || team.AuctionId != auctionId) return "Unknown team.";

        var (spent, squad) = await TeamTotals(db, teamId);
        var remaining = team.Wallet - spent;
        var maxSquad = team.SquadSize > 0 ? team.SquadSize : cfg.MaxSquad;

        if (squad >= maxSquad) return "Your squad is full.";
        if (newBid > remaining) return "Not enough purse for that bid.";

        if (cfg.ReserveForMinSquad)
        {
            var slotsStillNeeded = Math.Max(0, cfg.MinSquad - (squad + 1));
            var cheapest = await db.Players
                .Where(p => p.AuctionId == auctionId && p.Status == PlayerStatus.Available && p.Id != s.PlayerId)
                .OrderBy(p => p.BasePrice).Select(p => p.BasePrice).FirstOrDefaultAsync();
            if (remaining - newBid < slotsStillNeeded * cheapest)
                return "That bid would leave too little purse to fill your minimum squad.";
        }

        s.Bid = newBid;
        s.LeaderId = teamId;
        s.Deadline = DateTime.UtcNow.AddSeconds(cfg.ConfirmSeconds);
        return null;
    });

    // ---------- state snapshot ----------

    private static string? Url(string? path) => string.IsNullOrEmpty(path) ? null : "/uploads/" + path;

    private static async Task<AuctionState> BuildState(AuctionDb db, LiveSession s)
    {
        var id = s.AuctionId;
        var auction = await db.Auctions.FindAsync(id);
        var cfg = await GetConfig(db, id);
        var teams = await db.Teams.Where(t => t.AuctionId == id).OrderBy(t => t.Id).ToListAsync();
        var players = await db.Players.Where(p => p.AuctionId == id).ToListAsync();
        var sales = await db.Sales.Where(x => x.AuctionId == id).ToListAsync();

        var teamDtos = teams.Select(t =>
        {
            var retained = players.Where(p => p.Status == PlayerStatus.Retained && p.RetainedTeamId == t.Id).ToList();
            var spent = sales.Where(x => x.TeamId == t.Id).Sum(x => x.Price) + retained.Sum(p => p.RetentionPrice);
            var squad = sales.Count(x => x.TeamId == t.Id) + retained.Count;
            var left = t.Wallet - spent;
            return new TeamDto(t.Id, t.Name, t.ShortName, Url(t.LogoPath), left, squad, left < cfg.LowWalletAlert);
        }).ToList();

        PlayerDto? current = null;
        if (s.PlayerId != null)
        {
            var p = players.FirstOrDefault(x => x.Id == s.PlayerId);
            if (p != null)
                current = new PlayerDto(p.Id, p.Name, p.Category, p.BasePrice, p.Matches, p.Runs,
                    p.Wickets, p.Style, p.Info, Url(p.PhotoPath));
        }

        var leaderName = s.LeaderId == null ? null : teams.FirstOrDefault(t => t.Id == s.LeaderId)?.Name;
        var left2 = players.Count(p => p.Status == PlayerStatus.Available && p.Id != s.PlayerId);

        return new AuctionState(
            id, auction?.Code ?? "", auction?.Name ?? "",
            s.Phase.ToString(), s.Paused, cfg.CurrentRound, current,
            s.Bid, s.LeaderId, leaderName,
            s.Paused ? null : s.Deadline, s.Paused ? s.RemainingMs : null, DateTime.UtcNow,
            Increments(cfg), cfg.ConfirmSeconds, teamDtos,
            left2, sales.Count, players.Count(p => p.Status == PlayerStatus.Unsold), s.LastSold);
    }
}

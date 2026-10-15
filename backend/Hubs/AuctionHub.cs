using AuctionApp.Models;
using AuctionApp.Services;
using Microsoft.AspNetCore.SignalR;

namespace AuctionApp.Hubs;

// Phones connect with ?token=... (from /api/login); the token says which team and auction.
// The big screen and admin connect with ?auctionId=... and only watch.
// Each connection joins the group for its auction, so screens only get their own auction's state.
public class AuctionHub : Hub
{
    private readonly AuctionEngine _engine;
    private readonly SessionStore _sessions;

    public AuctionHub(AuctionEngine engine, SessionStore sessions)
    {
        _engine = engine;
        _sessions = sessions;
    }

    public static string Group(int auctionId) => $"auction-{auctionId}";

    public override async Task OnConnectedAsync()
    {
        var query = Context.GetHttpContext()?.Request.Query;
        var token = query?["token"].ToString();
        int? auctionId = null;

        if (!string.IsNullOrEmpty(token) && _sessions.TryGet(token, out var session))
        {
            Context.Items["teamId"] = session.TeamId;
            auctionId = session.AuctionId;
        }
        else if (int.TryParse(query?["auctionId"].ToString(), out var id))
        {
            auctionId = id;
        }

        if (auctionId == null)
        {
            Context.Abort();
            return;
        }

        Context.Items["auctionId"] = auctionId.Value;
        await Groups.AddToGroupAsync(Context.ConnectionId, Group(auctionId.Value));
        await base.OnConnectedAsync();
    }

    public async Task<AuctionState> GetState() =>
        await _engine.GetState((int)Context.Items["auctionId"]!) ?? throw new HubException("Auction not found.");

    // Returns null on success, or a short message to show the owner.
    public async Task<string?> PlaceBid(long increment)
    {
        if (!Context.Items.TryGetValue("teamId", out var value) || value is not int teamId)
            return "Log in first.";
        return await _engine.PlaceBid((int)Context.Items["auctionId"]!, teamId, increment);
    }
}

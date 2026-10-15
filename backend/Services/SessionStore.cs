using System.Collections.Concurrent;

namespace AuctionApp.Services;

public record OwnerSession(int TeamId, int AuctionId);

public class SessionStore
{
    private readonly ConcurrentDictionary<string, OwnerSession> _tokens = new();

    public string Create(int teamId, int auctionId)
    {
        var token = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(16));
        _tokens[token] = new OwnerSession(teamId, auctionId);
        return token;
    }

    public bool TryGet(string token, out OwnerSession session) => _tokens.TryGetValue(token, out session!);

    // Called when an auction or team is deleted so old phones can't keep bidding.
    public void RemoveWhere(Func<OwnerSession, bool> match)
    {
        foreach (var (token, s) in _tokens)
            if (match(s)) _tokens.TryRemove(token, out _);
    }
}

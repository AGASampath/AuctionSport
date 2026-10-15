namespace AuctionApp.Services;

// Checks every quarter second whether the confirm timer has run out.
public class AuctionTicker : BackgroundService
{
    private readonly AuctionEngine _engine;
    public AuctionTicker(AuctionEngine engine) => _engine = engine;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMilliseconds(250));
        try
        {
            while (await timer.WaitForNextTickAsync(ct))
            {
                try { await _engine.TickAsync(); }
                catch (Exception ex) { Console.WriteLine($"Ticker error: {ex.Message}"); }
            }
        }
        catch (OperationCanceledException) { }
    }
}

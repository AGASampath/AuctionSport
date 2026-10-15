namespace AuctionApp.Models;

public record LoginRequest(int TeamId, string Pin);
public record PickRequest(string? Category);

public record AuctionRequest(string Code, string Name, string? Venue, DateOnly? AuctionDate, AuctionStatus Status);

public record AuctionSummary(int Id, string Code, string Name, string Venue, DateOnly? AuctionDate,
    AuctionStatus Status, DateTime CreatedUtc, int Teams, int Players, int Sold);

// Wallet or SquadSize of 0 means "use the auction's default".
public record TeamRequest(string Name, string ShortName, string? OwnerName, string? Phone, string Pin, long Wallet, int SquadSize);

public record TeamRow(int Id, string Name, string ShortName, string OwnerName, string Phone, string Pin, string? LogoUrl,
    long Wallet, int SquadSize, long Spent, long Remaining, int Players);

public record PlayerRequest(string Name, string Category, long BasePrice, int Matches, int Runs, int Wickets,
    string? Style, string? Info, int? RetainedTeamId, long RetentionPrice);

public record PlayerRow(int Id, string Name, string Category, long BasePrice, int Matches, int Runs, int Wickets,
    string Style, string Info, string? PhotoUrl, PlayerStatus Status,
    int? RetainedTeamId, string? RetainedTeamName, long RetentionPrice,
    string? SoldTeamName, long? SoldPrice);

public record PlayerDto(int Id, string Name, string Category, long BasePrice,
    int Matches, int Runs, int Wickets, string Style, string Info, string? PhotoUrl);

public record TeamDto(int Id, string Name, string ShortName, string? LogoUrl,
    long WalletRemaining, int SquadCount, bool LowWallet);

public record AuctionState(
    int AuctionId, string AuctionCode, string AuctionName,
    string Phase, bool Paused, int Round, PlayerDto? Player,
    long CurrentBid, int? LeaderTeamId, string? LeaderTeamName,
    DateTime? DeadlineUtc, double? RemainingMs, DateTime ServerNowUtc,
    long[] Increments, int ConfirmSeconds, List<TeamDto> Teams,
    int PlayersLeft, int Sold, int Unsold, string? LastSold);

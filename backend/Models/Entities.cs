namespace AuctionApp.Models;

public enum PlayerStatus { Available, Sold, Unsold, Retained }

// Draft: being set up. Live: owners can log in and bid. Completed: finished, kept for reports.
public enum AuctionStatus { Draft, Live, Completed }

// Top level. Teams, players, sales and configuration all belong to one auction (for example "001 - BPL").
public class Auction
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Name { get; set; } = "";
    public string Venue { get; set; } = "";
    public DateOnly? AuctionDate { get; set; }
    public AuctionStatus Status { get; set; } = AuctionStatus.Draft;
    public DateTime CreatedUtc { get; set; }
}

public class Team
{
    public int Id { get; set; }
    public int AuctionId { get; set; }
    public string Name { get; set; } = "";
    public string ShortName { get; set; } = "";
    public string OwnerName { get; set; } = "";
    public string Phone { get; set; } = "";
    public string Pin { get; set; } = "";
    public string? LogoPath { get; set; }
    public long Wallet { get; set; }
    public int SquadSize { get; set; } = 12;
}

public class Player
{
    public int Id { get; set; }
    public int AuctionId { get; set; }
    public string Name { get; set; } = "";
    public string Category { get; set; } = "AllRounder"; // Batting, Bowling, AllRounder
    public long BasePrice { get; set; }
    public int Matches { get; set; }
    public int Runs { get; set; }
    public int Wickets { get; set; }
    public string Style { get; set; } = "";
    public string Info { get; set; } = "";
    public string? PhotoPath { get; set; }
    public PlayerStatus Status { get; set; } = PlayerStatus.Available;
    public int? RetainedTeamId { get; set; }
    public long RetentionPrice { get; set; }
}

public class Sale
{
    public int Id { get; set; }
    public int AuctionId { get; set; }
    public int PlayerId { get; set; }
    public int TeamId { get; set; }
    public long Price { get; set; }
    public int Round { get; set; }
    public DateTime SoldAtUtc { get; set; }
}

// One per auction.
public class AuctionConfig
{
    public int Id { get; set; }
    public int AuctionId { get; set; }
    public string BidIncrements { get; set; } = "100,1000,5000";
    public string Round2Increments { get; set; } = "";
    public int ConfirmSeconds { get; set; } = 30;
    public long DefaultWallet { get; set; } = 30000;
    public int MinSquad { get; set; } = 11;
    public int MaxSquad { get; set; } = 14;
    public long LowWalletAlert { get; set; } = 2000;
    public bool ReserveForMinSquad { get; set; } = true;
    public int CurrentRound { get; set; } = 1;
}

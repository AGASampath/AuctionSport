using AuctionApp.Models;
using Microsoft.EntityFrameworkCore;

namespace AuctionApp.Data;

public class AuctionDb : DbContext
{
    public AuctionDb(DbContextOptions<AuctionDb> options) : base(options) { }

    public DbSet<Auction> Auctions => Set<Auction>();
    public DbSet<Team> Teams => Set<Team>();
    public DbSet<Player> Players => Set<Player>();
    public DbSet<Sale> Sales => Set<Sale>();
    public DbSet<AuctionConfig> Configs => Set<AuctionConfig>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        b.Entity<Auction>().Property(a => a.Status).HasConversion<string>();
        b.Entity<Auction>().HasIndex(a => a.Code).IsUnique();

        // Every child row is removed with its auction.
        b.Entity<Team>().HasOne<Auction>().WithMany().HasForeignKey(t => t.AuctionId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Player>().HasOne<Auction>().WithMany().HasForeignKey(p => p.AuctionId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<Sale>().HasOne<Auction>().WithMany().HasForeignKey(s => s.AuctionId).OnDelete(DeleteBehavior.Cascade);
        b.Entity<AuctionConfig>().HasOne<Auction>().WithOne().HasForeignKey<AuctionConfig>(c => c.AuctionId).OnDelete(DeleteBehavior.Cascade);

        b.Entity<Player>().Property(p => p.Status).HasConversion<string>();
        b.Entity<Player>().HasIndex(p => new { p.AuctionId, p.Status });
        b.Entity<Sale>().HasIndex(s => new { s.AuctionId, s.TeamId });
    }
}

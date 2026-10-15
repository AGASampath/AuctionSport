using System.Text.Json.Serialization;
using AuctionApp;
using AuctionApp.Data;
using AuctionApp.Hubs;
using AuctionApp.Services;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;

var builder = WebApplication.CreateBuilder(args);

Directory.CreateDirectory("AppData");
var uploads = Path.GetFullPath(builder.Configuration["UploadsPath"] ?? "AppData/uploads");
Directory.CreateDirectory(uploads);

builder.Services.AddDbContextFactory<AuctionDb>(o =>
    o.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=AppData/auction.db"));
// Enums go over the wire as names ("Live", "Sold"), not numbers.
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSignalR().AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSingleton<AuctionEngine>();
builder.Services.AddSingleton<SessionStore>();
builder.Services.AddHostedService<AuctionTicker>();
builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.SetIsOriginAllowed(_ => true).AllowAnyHeader().AllowAnyMethod().AllowCredentials()));

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var factory = scope.ServiceProvider.GetRequiredService<IDbContextFactory<AuctionDb>>();
    using var db = factory.CreateDbContext();
    db.Database.EnsureCreated();
    // EnsureCreated doesn't upgrade an existing file. A database from before auctions were added has no Auctions table.
    try { db.Auctions.Any(); }
    catch (Microsoft.Data.Sqlite.SqliteException)
    {
        Console.WriteLine("The database was created by an older version. Move AppData/auction.db aside and start again.");
        throw;
    }
}

app.UseCors();
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploads),
    RequestPath = "/uploads"
});

app.MapHub<AuctionHub>("/hub/auction");
app.MapApi(uploads);
app.MapFallbackToFile("index.html");

app.Run();

using System.Text;
using System.Threading.RateLimiting;
using FluentValidation;
using KizTavlasi.Api;
using KizTavlasi.Api.Realtime;
using KizTavlasi.Application;
using KizTavlasi.Application.Abstractions;
using KizTavlasi.Infrastructure;
using KizTavlasi.Infrastructure.Persistence;
using KizTavlasi.Infrastructure.Security;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Serilog;

var builder = WebApplication.CreateBuilder(args);

builder.Host.UseSerilog((context, loggerConfiguration) => loggerConfiguration
    .ReadFrom.Configuration(context.Configuration)
    .Enrich.FromLogContext()
    .WriteTo.Console());

builder.Services.AddInfrastructure(builder.Configuration, builder.Environment.IsDevelopment());
builder.Services.AddScoped<IGameNotifier, SignalRGameNotifier>();
builder.Services.AddValidatorsFromAssemblyContaining<CreateRoomRequestValidator>();

builder.Services.AddSignalR();
builder.Services.AddExceptionHandler<GameExceptionHandler>();
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();

builder.Services.AddHealthChecks()
    .AddDbContextCheck<GameDbContext>("database", tags: ["ready"]);

var jwtSection = builder.Configuration.GetSection(JwtOptions.SectionName);
var signingKey = jwtSection["SigningKey"];
if (string.IsNullOrWhiteSpace(signingKey))
{
    throw new InvalidOperationException(
        "Jwt__SigningKey ayarı zorunludur. Environment variable veya user-secrets üzerinden sağlayın.");
}

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSection["Issuer"],
            ValidAudience = jwtSection["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(signingKey)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };

        // SignalR WebSocket bağlantısında token'ı accessTokenFactory query parametresinden okur.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = context =>
            {
                var accessToken = context.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(accessToken) && context.HttpContext.Request.Path.StartsWithSegments("/hubs/game"))
                {
                    context.Token = accessToken;
                }
                return Task.CompletedTask;
            }
        };
    });

builder.Services.AddAuthorization();

var rateLimits = builder.Configuration.GetSection("RateLimiting");
var globalLimit = rateLimits.GetValue("GlobalPerMinute", 200);
var roomCreateLimit = rateLimits.GetValue("RoomCreatePerMinute", 10);
var roomJoinLimit = rateLimits.GetValue("RoomJoinPerMinute", 30);

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;

    options.GlobalLimiter = PartitionedRateLimiter.Create<HttpContext, string>(context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = globalLimit,
                Window = TimeSpan.FromMinutes(1)
            }));

    options.AddPolicy("room-create", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = roomCreateLimit,
                Window = TimeSpan.FromMinutes(1)
            }));

    // Oda kodu enumeration hızını sınırlar.
    options.AddPolicy("room-join", context =>
        RateLimitPartition.GetFixedWindowLimiter(
            context.Connection.RemoteIpAddress?.ToString() ?? "unknown",
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = roomJoinLimit,
                Window = TimeSpan.FromMinutes(1)
            }));
});

var allowedOrigins = builder.Configuration.GetSection("AllowedOrigins").Get<string[]>() ?? [];
if (builder.Environment.IsDevelopment() || allowedOrigins.Length > 0)
{
    builder.Services.AddCors(options =>
    {
        options.AddDefaultPolicy(policy =>
        {
            if (builder.Environment.IsDevelopment())
            {
                policy.WithOrigins("http://localhost:5173", "http://127.0.0.1:5173");
            }
            else
            {
                policy.WithOrigins(allowedOrigins);
            }
            policy.AllowAnyHeader().AllowAnyMethod().AllowCredentials();
        });
    });
}

builder.WebHost.ConfigureKestrel(kestrel =>
{
    kestrel.Limits.MaxRequestBodySize = 64 * 1024;
});

var app = builder.Build();

if (app.Configuration.GetValue<bool>("Database:AutoMigrate", true) && !app.Environment.IsEnvironment("Testing"))
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<GameDbContext>();
    await db.Database.MigrateAsync();
}

app.UseExceptionHandler();

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
    app.UseHttpsRedirection();
}

app.Use(async (context, next) =>
{
    context.Response.Headers["X-Content-Type-Options"] = "nosniff";
    context.Response.Headers["Referrer-Policy"] = "strict-origin-when-cross-origin";
    context.Response.Headers["X-Frame-Options"] = "DENY";
    context.Response.Headers["Content-Security-Policy"] =
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
        "connect-src 'self' ws: wss:; font-src 'self'; manifest-src 'self'; frame-ancestors 'none'";
    await next();
});

app.UseSerilogRequestLogging();

app.UseDefaultFiles();
app.UseStaticFiles();

if (app.Environment.IsDevelopment() || allowedOrigins.Length > 0)
{
    app.UseCors();
}

app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapRoomEndpoints();
app.MapHub<GameHub>("/hubs/game");

app.MapHealthChecks("/health/live", new HealthCheckOptions { Predicate = _ => false });
app.MapHealthChecks("/health/ready", new HealthCheckOptions { Predicate = check => check.Tags.Contains("ready") });

// SPA fallback: bilinen API yolları dışındaki istekler frontend'e gider.
app.MapFallbackToFile("index.html");

app.Run();

public partial class Program;

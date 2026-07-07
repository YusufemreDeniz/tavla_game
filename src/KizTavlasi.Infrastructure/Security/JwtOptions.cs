using System.ComponentModel.DataAnnotations;

namespace KizTavlasi.Infrastructure.Security;

public sealed class JwtOptions
{
    public const string SectionName = "Jwt";

    /// <summary>Environment variable veya user-secrets üzerinden gelir; repo'da gerçek değer bulunmaz.</summary>
    [Required, MinLength(32)]
    public string SigningKey { get; set; } = string.Empty;

    [Required]
    public string Issuer { get; set; } = "KizTavlasiOnline";

    [Required]
    public string Audience { get; set; } = "KizTavlasiOnline";

    [Range(1, 168)]
    public int ExpirationHours { get; set; } = 24;
}

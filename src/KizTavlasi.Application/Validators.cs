using FluentValidation;
using KizTavlasi.Application.Dtos;

namespace KizTavlasi.Application;

public static class DisplayNameSanitizer
{
    /// <summary>Kontrol karakterlerini temizler, boşlukları sadeleştirir.</summary>
    public static string Sanitize(string input)
    {
        var cleaned = new string(input.Where(c => !char.IsControl(c)).ToArray());
        return string.Join(' ', cleaned.Split(' ', StringSplitOptions.RemoveEmptyEntries)).Trim();
    }
}

public sealed class CreateRoomRequestValidator : AbstractValidator<CreateRoomRequest>
{
    public CreateRoomRequestValidator()
    {
        RuleFor(r => r.DisplayName)
            .NotEmpty().WithMessage("Oyuncu adı gereklidir.")
            .Must(name => DisplayNameSanitizer.Sanitize(name).Length is >= GameConstants.DisplayNameMinLength and <= GameConstants.DisplayNameMaxLength)
            .WithMessage($"Oyuncu adı {GameConstants.DisplayNameMinLength}-{GameConstants.DisplayNameMaxLength} karakter olmalıdır.");

        RuleFor(r => r.BestOf)
            .Must(b => GameConstants.SupportedBestOf.Contains(b))
            .WithMessage("Oyun formatı tek el, 3 el veya 5 el olmalıdır.");
    }
}

public sealed class JoinRoomRequestValidator : AbstractValidator<JoinRoomRequest>
{
    public JoinRoomRequestValidator()
    {
        RuleFor(r => r.DisplayName)
            .NotEmpty().WithMessage("Oyuncu adı gereklidir.")
            .Must(name => DisplayNameSanitizer.Sanitize(name).Length is >= GameConstants.DisplayNameMinLength and <= GameConstants.DisplayNameMaxLength)
            .WithMessage($"Oyuncu adı {GameConstants.DisplayNameMinLength}-{GameConstants.DisplayNameMaxLength} karakter olmalıdır.");
    }
}

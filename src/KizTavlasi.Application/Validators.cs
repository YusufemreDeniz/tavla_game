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

        RuleFor(r => r.TurnTimeLimitSeconds)
            .Must(BeSupportedTurnTimeLimit)
            .WithMessage("Hamle süresi süresiz, 30 sn veya 15 sn olmalıdır.");
    }

    internal static bool BeSupportedTurnTimeLimit(int? seconds) =>
        seconds is null or 0 || GameConstants.SupportedTurnTimeLimits.Contains(seconds.Value);
}

public sealed class CreateBotRoomRequestValidator : AbstractValidator<CreateBotRoomRequest>
{
    public CreateBotRoomRequestValidator()
    {
        RuleFor(r => r.DisplayName)
            .NotEmpty().WithMessage("Oyuncu adı gereklidir.")
            .Must(name => DisplayNameSanitizer.Sanitize(name).Length is >= GameConstants.DisplayNameMinLength and <= GameConstants.DisplayNameMaxLength)
            .WithMessage($"Oyuncu adı {GameConstants.DisplayNameMinLength}-{GameConstants.DisplayNameMaxLength} karakter olmalıdır.");

        RuleFor(r => r.BestOf)
            .Must(b => GameConstants.SupportedBestOf.Contains(b))
            .WithMessage("Oyun formatı tek el, 3 el veya 5 el olmalıdır.");

        RuleFor(r => r.Difficulty)
            .Must(d => TryParseDifficulty(d, out _))
            .WithMessage("Zorluk seviyesi Kolay (Easy) veya Usta (Master) olmalıdır.");

        RuleFor(r => r.TurnTimeLimitSeconds)
            .Must(CreateRoomRequestValidator.BeSupportedTurnTimeLimit)
            .WithMessage("Hamle süresi süresiz, 30 sn veya 15 sn olmalıdır.");
    }

    public static bool TryParseDifficulty(string? value, out Domain.BotDifficulty difficulty)
    {
        difficulty = default;
        return !string.IsNullOrWhiteSpace(value)
            && !int.TryParse(value, out _)
            && Enum.TryParse(value, ignoreCase: true, out difficulty)
            && Enum.IsDefined(difficulty);
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

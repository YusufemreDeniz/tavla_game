using System.Security.Cryptography;
using KizTavlasi.Application.Abstractions;

namespace KizTavlasi.Infrastructure.Security;

/// <summary>
/// Kriptografik rastgelelikle 6 karakterli oda kodu üretir.
/// Alfabede 0, O, 1, I, L gibi karışan karakterler yoktur.
/// </summary>
public sealed class RoomCodeGenerator : IRoomCodeGenerator
{
    private const string Alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
    private const int CodeLength = 6;

    public string Generate()
    {
        Span<char> buffer = stackalloc char[CodeLength];
        for (var i = 0; i < CodeLength; i++)
        {
            buffer[i] = Alphabet[RandomNumberGenerator.GetInt32(Alphabet.Length)];
        }
        return new string(buffer);
    }
}

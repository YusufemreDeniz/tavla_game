import { defineConfig } from '@playwright/test';

/**
 * E2E testleri build edilmiş frontend'i sunan API host'una karşı çalışır.
 * Deterministik zar için Game__DeterministicDiceSeed yalnızca Development
 * ortamında etkinleşir (production'da devre dışıdır).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5211',
    trace: 'off',
  },
  webServer: {
    command:
      'dotnet run --project ../KizTavlasi.Api --no-launch-profile --urls http://localhost:5211',
    url: 'http://localhost:5211/health/live',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      ASPNETCORE_ENVIRONMENT: 'Development',
      ConnectionStrings__DefaultConnection:
        process.env.E2E_SQL_CONNECTION ??
        'Server=(localdb)\\MSSQLLocalDB;Database=KizTavlasiE2E;Trusted_Connection=True;TrustServerCertificate=True',
      Jwt__SigningKey: 'e2e-test-signing-key-not-for-production-0123456789',
      Game__DeterministicDiceSeed: '424242',
      RateLimiting__GlobalPerMinute: '100000',
      RateLimiting__RoomCreatePerMinute: '100000',
      RateLimiting__RoomJoinPerMinute: '100000',
    },
  },
});

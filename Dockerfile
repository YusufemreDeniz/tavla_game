# --- Frontend build ---
FROM node:24-alpine AS web-build
WORKDIR /app
COPY src/KizTavlasi.Web/package.json src/KizTavlasi.Web/package-lock.json ./
RUN npm ci
COPY src/KizTavlasi.Web/ ./
# Vite çıktısını yerel klasöre yaz (csproj yolu container'da yok).
RUN npm run typecheck && npx vite build --outDir /app/dist

# --- Backend build ---
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS api-build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props ./
COPY src/KizTavlasi.Domain/KizTavlasi.Domain.csproj src/KizTavlasi.Domain/
COPY src/KizTavlasi.Application/KizTavlasi.Application.csproj src/KizTavlasi.Application/
COPY src/KizTavlasi.Infrastructure/KizTavlasi.Infrastructure.csproj src/KizTavlasi.Infrastructure/
COPY src/KizTavlasi.Api/KizTavlasi.Api.csproj src/KizTavlasi.Api/
RUN dotnet restore src/KizTavlasi.Api/KizTavlasi.Api.csproj
COPY src/KizTavlasi.Domain/ src/KizTavlasi.Domain/
COPY src/KizTavlasi.Application/ src/KizTavlasi.Application/
COPY src/KizTavlasi.Infrastructure/ src/KizTavlasi.Infrastructure/
COPY src/KizTavlasi.Api/ src/KizTavlasi.Api/
RUN dotnet publish src/KizTavlasi.Api/KizTavlasi.Api.csproj -c Release -o /app/publish

# --- Runtime ---
FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS runtime
WORKDIR /app
COPY --from=api-build /app/publish ./
COPY --from=web-build /app/dist ./wwwroot
ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080
ENTRYPOINT ["dotnet", "KizTavlasi.Api.dll"]

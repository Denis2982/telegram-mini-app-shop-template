$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$releaseDirectory = Join-Path $repoRoot "release"
$archivePath = Join-Path $releaseDirectory "telegram-mini-app-shop-template-v1.0.zip"
$stagingDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ("shop-template-release-" + [Guid]::NewGuid().ToString("N"))
$packageRoot = Join-Path $stagingDirectory "telegram-mini-app-shop-template"

$requiredItems = @(
  ".dockerignore",
  ".env.example",
  ".gitignore",
  "Dockerfile",
  "README.md",
  "docker-compose.yml",
  "drizzle",
  "drizzle.config.ts",
  "docs/DEPLOYMENT.md",
  "eslint.config.mjs",
  "LICENSE.md",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "postcss.config.mjs",
  "scripts/db-baseline.mjs",
  "src",
  "tsconfig.json"
)

try {
  New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null

  foreach ($item in $requiredItems) {
    $sourcePath = Join-Path $repoRoot $item
    if (-not (Test-Path -LiteralPath $sourcePath)) {
      throw "Required release file is missing: $item"
    }

    $destinationPath = Join-Path $packageRoot $item
    New-Item -ItemType Directory -Path (Split-Path $destinationPath -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $sourcePath -Destination $destinationPath -Recurse -Force
  }

  New-Item -ItemType Directory -Path $releaseDirectory -Force | Out-Null
  Add-Type -AssemblyName System.IO.Compression
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archiveStream = [System.IO.File]::Open($archivePath, [System.IO.FileMode]::Create)
  $zipArchive = $null
  try {
    $zipArchive = [System.IO.Compression.ZipArchive]::new(
      $archiveStream,
      [System.IO.Compression.ZipArchiveMode]::Create,
      $false
    )
    Get-ChildItem -LiteralPath $packageRoot -Recurse -File | ForEach-Object {
      $relativePath = $_.FullName.Substring($packageRoot.Length).TrimStart([char[]]@("\", "/"))
      $entryName = "telegram-mini-app-shop-template/" + $relativePath.Replace("\", "/")
      [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zipArchive,
        $_.FullName,
        $entryName,
        [System.IO.Compression.CompressionLevel]::Optimal
      ) | Out-Null
    }
  }
  finally {
    if ($zipArchive) {
      $zipArchive.Dispose()
    }
    else {
      $archiveStream.Dispose()
    }
  }

  $archive = $null
  try {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
    $entries = @($archive.Entries)
    $entryNames = @($entries | ForEach-Object { $_.FullName.Replace("\", "/") })
    $requiredEntries = @(
      "telegram-mini-app-shop-template/README.md",
      "telegram-mini-app-shop-template/LICENSE.md",
      "telegram-mini-app-shop-template/.env.example",
      "telegram-mini-app-shop-template/package-lock.json",
      "telegram-mini-app-shop-template/docs/DEPLOYMENT.md"
    )
    foreach ($entry in $requiredEntries) {
      if ($entryNames -notcontains $entry) {
        throw "Release archive is missing required file: $entry"
      }
    }

    $leakedEnvironmentFiles = @($entryNames | Where-Object {
      $_ -match "(^|/)\.env($|\.)" -and $_ -notmatch "(^|/)\.env\.example$"
    })
    $forbiddenFiles = @($entryNames | Where-Object {
      $_ -match "(^|/)\.git(/|$)|(^|/)node_modules(/|$)|(^|/)\.next(/|$)|(^|/)public/uploads(/|$)|(^|/)tsconfig\.tsbuildinfo$"
    })
    if ($leakedEnvironmentFiles.Count -or $forbiddenFiles.Count) {
      throw "Release archive contains excluded local data or build artifacts."
    }

    Write-Output "Created $archivePath"
    Write-Output ("Files: {0}; size: {1:N0} KB" -f $entries.Count, ((Get-Item -LiteralPath $archivePath).Length / 1KB))
  }
  finally {
    if ($archive) { $archive.Dispose() }
  }
}
finally {
  if (Test-Path -LiteralPath $stagingDirectory) {
    Remove-Item -LiteralPath $stagingDirectory -Recurse -Force
  }
}

param(
  [Parameter(Mandatory=$true)][string]$Cli,
  [Parameter(Mandatory=$true)][string]$BlocksDirectory,
  [Parameter(Mandatory=$true)][string]$MapName,
  [Parameter(Mandatory=$true)][string]$OutputDirectory,
  [Parameter(Mandatory=$true)][string[]]$Blocks,
  [string]$NamePattern = '^Beyd_Avatar_Boy_(Suit|Face|Hair|Top|Bottom|Shoe|Eyebrow|Pupil)_'
)
$ErrorActionPreference = 'Stop'
if ($Blocks.Count -gt 10) { throw 'Máximo 10 bloques por lote. Selecciona fuentes concretas desde el mapa.' }
$cliPath = (Resolve-Path -LiteralPath $Cli).Path
$blocksPath = (Resolve-Path -LiteralPath $BlocksDirectory).Path
$outputPath = [IO.Path]::GetFullPath($OutputDirectory)
if ($outputPath.TrimEnd('\') -eq $blocksPath.TrimEnd('\') -or $outputPath.StartsWith($blocksPath.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)) { throw 'La salida debe estar separada de los originales.' }
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
$runtimePath = Split-Path -Parent $cliPath
if (!(Test-Path -LiteralPath (Join-Path $runtimePath "Maps/$MapName.bin"))) { throw 'Falta el mapa CAB en Maps del runtime de AnimeStudio.' }
Push-Location $runtimePath
try {
  foreach ($block in $Blocks) {
    if ($block -notmatch '^\d{8}$') { throw "Identificador de bloque inválido: $block" }
    $sourcePath = Join-Path $blocksPath "00/$block.blk"
    if (!(Test-Path -LiteralPath $sourcePath)) { throw "No existe el bloque: $block" }
    $destination = Join-Path $outputPath $block
    $logPath = Join-Path $outputPath "$block.log"
    Write-Host "[AnimeStudio] Extrayendo $block. Progreso detallado: $logPath"
    & $cliPath $sourcePath $destination --game GI --map_op 3 --map_name $MapName --types GameObject Material Texture2D --names $NamePattern --export_type Convert *> $logPath
    if ($LASTEXITCODE -ne 0) { throw "AnimeStudio falló en $block. Revisa $logPath" }
    $completed = Select-String -LiteralPath $logPath -Pattern 'Finished exporting' -Quiet
    if (!$completed) { throw "No se confirmó la exportación de $block. Revisa el mapa y la versión CLI en $logPath" }
    Write-Host "[AnimeStudio] $block extraído; pendiente de revisión geométrica y de materiales."
  }
} finally { Pop-Location }

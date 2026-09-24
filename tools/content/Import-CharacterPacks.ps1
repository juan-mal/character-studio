param(
  [Parameter(Mandatory=$true)][string]$Source,
  [string[]]$Characters = @('Amber','Barbara'),
  [ValidateRange(1,10)][int]$Limit = 2,
  [string]$Variant = 'Default',
  [string]$BlenderPath,
  [string]$Output
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
if (-not $Output) { $Output = Join-Path $projectRoot 'content/characters' }
if (-not $BlenderPath) {
  $command = Get-Command blender -ErrorAction SilentlyContinue
  if ($command) { $BlenderPath = $command.Source }
  else {
    $installRoot = Join-Path $env:ProgramFiles 'Blender Foundation'
    $BlenderPath = Get-ChildItem -LiteralPath $installRoot -Directory | Sort-Object Name -Descending | ForEach-Object { Join-Path $_.FullName 'blender.exe' } | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  }
}
if (-not $BlenderPath -or -not (Test-Path -LiteralPath $BlenderPath)) { throw 'Indica -BlenderPath con una instalación existente.' }
$reports = Join-Path $projectRoot 'reports'
New-Item -ItemType Directory -Force -Path $reports | Out-Null
$log = Join-Path $reports ('import-' + (Get-Date -Format 'yyyy-MM-dd-HH-mm-ss') + '.log')
Start-Transcript -Path $log | Out-Null
try {
  & $BlenderPath -b -t 2 --python-exit-code 1 --python (Join-Path $PSScriptRoot 'import_characters.py') -- --source $Source --output $Output --limit $Limit --variant $Variant --characters @Characters
  if ($LASTEXITCODE -ne 0) { throw 'Importación detenida. Los paquetes completos quedan guardados; corrige el error y repite el comando.' }
  Write-Host 'Preparación finalizada. Los paquetes nuevos requieren revisión visual antes de activar reviewed en assembly.json. Luego ejecuta pnpm assets:scan.'
} finally { Stop-Transcript | Out-Null }

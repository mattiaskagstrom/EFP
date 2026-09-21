param(
  [ValidateSet('Fast', 'ApiContract', 'Backend', 'Frontend', 'Full')]
  [string]$Suite = 'Fast',
  [switch]$KeepEnvironment
)

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $repoRoot

function Require-Command([string]$Name) {
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) { throw "Saknar kommando: $Name" }
}

function Invoke-Checked([string]$File, [string[]]$Arguments) {
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { throw "Kommandot misslyckades: $File $($Arguments -join ' ')" }
}

Require-Command dotnet
Require-Command pnpm
Require-Command node

$unitProject = 'tests/Api.UnitTests/Api.UnitTests.csproj'
$testProject = 'tests/Api.ContractTests/Api.ContractTests.csproj'
$composeProject = 'efp-test'
$startedEnvironment = $false
$openApiPath = Join-Path ([System.IO.Path]::GetTempPath()) 'efp-openapi.current.json'

try {
  switch ($Suite) {
    'ApiContract' { Invoke-Checked 'dotnet' @('test', $testProject); break }
    'Backend' { Invoke-Checked 'dotnet' @('test', $unitProject); Invoke-Checked 'dotnet' @('test', $testProject); break }
    'Frontend' { Invoke-Checked 'pnpm' @('--filter', 'efp-admin', 'build'); Invoke-Checked 'pnpm' @('--filter', 'efp-admin', 'test'); break }
    'Fast' {
      Invoke-Checked 'dotnet' @('test', $unitProject)
      Invoke-Checked 'dotnet' @('test', $testProject)
      Invoke-Checked 'pnpm' @('--filter', 'efp-admin', 'build')
      Invoke-Checked 'pnpm' @('--filter', 'efp-admin', 'test')
      Require-Command docker
      Invoke-Checked 'docker' @('compose', '-p', $composeProject, 'up', '-d', '--build')
      $startedEnvironment = $true
      for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { Invoke-Checked 'curl.exe' @('--fail', '--silent', 'http://localhost:8080/health'); break } catch { Start-Sleep -Seconds 2 }
        if ($attempt -eq 29) { throw 'API startade inte inom 60 sekunder.' }
      }
      Invoke-Checked 'curl.exe' @('--fail', '--silent', 'http://localhost:8080/openapi/v1.json', '-o', $openApiPath)
      Invoke-Checked 'node' @('scripts/compare-openapi.mjs', 'tests/contracts/openapi.v1.json', $openApiPath)
      Invoke-Checked 'pnpm' @('test:e2e:smoke')
      Invoke-Checked 'pnpm' @('test:e2e:critical')
      break
    }
    'Full' {
      Require-Command docker
      Invoke-Checked 'docker' @('compose', '-p', $composeProject, 'up', '-d', '--build')
      $startedEnvironment = $true
      for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try { Invoke-Checked 'curl.exe' @('--fail', '--silent', 'http://localhost:8080/health'); break } catch { Start-Sleep -Seconds 2 }
        if ($attempt -eq 29) { throw 'API startade inte inom 60 sekunder.' }
      }
      Invoke-Checked 'pnpm' @('exec', 'playwright', 'install', 'chromium')
      Invoke-Checked 'pnpm' @('test:e2e:full')
      break
    }
  }
} finally {
  if ($startedEnvironment -and -not $KeepEnvironment) {
    & docker compose -p $composeProject down -v
  }
  if (Test-Path $openApiPath) { Remove-Item -LiteralPath $openApiPath -Force }
}

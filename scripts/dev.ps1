[CmdletBinding()]
param(
    [switch]$KeepDatabase,
    [switch]$SkipDependencyRestore,
    [switch]$SkipPrerequisiteCheck
)

$ErrorActionPreference = 'Stop'
$script:StartedProcesses = @()
$script:StartedDatabase = $false

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Require-Command([string]$Name, [string]$InstallHint) {
    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if (-not $command) {
        throw "$Name saknas. Installera det först: $InstallHint"
    }
    return $command
}

function Invoke-Checked([string]$FilePath, [string[]]$Arguments) {
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Kommandot misslyckades: $FilePath $($Arguments -join ' ')"
    }
}

function Get-ToolVersion([string]$Command, [string[]]$Arguments) {
    return (& $Command @Arguments | Select-Object -First 1).Trim()
}

function Get-ProcessCommandPath($Command) {
    $source = $Command.Source
    if ($source -and $source.EndsWith('.ps1', [System.StringComparison]::OrdinalIgnoreCase)) {
        $cmdPath = [System.IO.Path]::ChangeExtension($source, '.cmd')
        if (Test-Path $cmdPath) { return $cmdPath }
        throw "Hittar ingen körbar Windows-wrapper för $source. Försökte: $cmdPath"
    }
    return $source
}

function Stop-StartedProcesses {
    foreach ($process in $script:StartedProcesses) {
        if ($process -and -not $process.HasExited) {
            Write-Host "Stoppar $($process.ProcessName) (PID $($process.Id))..." -ForegroundColor DarkGray
            Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
        }
    }
}

function Stop-StartedDatabase {
    if ($script:StartedDatabase -and -not $KeepDatabase) {
        Write-Host 'Stoppar utvecklingsdatabasen. Volymen sparas.' -ForegroundColor DarkGray
        & docker compose stop db | Out-Host
    }
}

try {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
    $apiProject = Join-Path $repoRoot 'src\Api\Efp.Api.csproj'
    $adminDirectory = Join-Path $repoRoot 'src\Admin'
    $composeFile = Join-Path $repoRoot 'docker-compose.yml'
    $nugetConfig = Join-Path $repoRoot 'NuGet.Config'
    $logDirectory = Join-Path $repoRoot '.dev-logs'

    if (-not (Test-Path $composeFile)) { throw "Hittar inte docker-compose.yml i $repoRoot" }
    if (-not (Test-Path $apiProject)) { throw "Hittar inte backendprojektet i $apiProject" }
    if (-not (Test-Path $adminDirectory)) { throw "Hittar inte adminprojektet i $adminDirectory" }

    if (-not $SkipPrerequisiteCheck) {
        Write-Step 'Kontrollerar prerequisites'
        $node = Require-Command 'node' 'https://nodejs.org/'
        $dotnet = Require-Command 'dotnet' 'https://dotnet.microsoft.com/download/dotnet/9.0'
        $docker = Require-Command 'docker' 'https://www.docker.com/products/docker-desktop/'

        $packageManager = Get-Command 'pnpm' -ErrorAction SilentlyContinue
        if (-not $packageManager) { $packageManager = Get-Command 'npm' -ErrorAction SilentlyContinue }
        if (-not $packageManager) { throw 'Varken pnpm eller npm hittades. Installera Node.js och pnpm/npm först.' }

        Write-Host "Node.js: $(Get-ToolVersion $node.Source @('--version'))"
        Write-Host ".NET SDK: $(Get-ToolVersion $dotnet.Source @('--version'))"
        Write-Host "Docker: $(Get-ToolVersion $docker.Source @('--version'))"
        Write-Host "Frontend package manager: $($packageManager.Name)"

        $nodeMajor = [int]((Get-ToolVersion $node.Source @('--version')) -replace '^v([0-9]+).*', '$1')
        if ($nodeMajor -lt 20) { throw 'Node.js 20 eller senare krävs.' }

        $sdkVersion = Get-ToolVersion $dotnet.Source @('--version')
        if ($sdkVersion -notmatch '^9\.') { throw ".NET 9 SDK krävs. Hittade $sdkVersion." }

        Write-Step 'Kontrollerar Docker daemon'
        Invoke-Checked $docker.Source @('info')
        $script:PackageManager = $packageManager
    }

    if (-not $script:PackageManager) {
        $script:PackageManager = Get-Command 'pnpm' -ErrorAction SilentlyContinue
        if (-not $script:PackageManager) { $script:PackageManager = Get-Command 'npm' -ErrorAction Stop }
    }

    New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

    if (-not $SkipDependencyRestore) {
        Write-Step 'Restore av NuGet-paket'
        $env:DOTNET_CLI_TELEMETRY_OPTOUT = '1'
        Invoke-Checked 'dotnet' @('restore', $apiProject, '--configfile', $nugetConfig)

        Write-Step 'Restore av frontendpaket'
        # Node använder normalt inte Windows certifikatförråd. Detta behövs i miljöer
        # där npm-registret nås via en företagsproxy eller annan TLS-inspektion.
        $env:NODE_USE_SYSTEM_CA = '1'
        if ($script:PackageManager.Name -like 'pnpm*') {
            # Kör från repositoryroten så att pnpm-workspace.yaml och workspace-
            # säkerhetsreglerna används även när fler frontendpaket tillkommer.
            Invoke-Checked $script:PackageManager.Source @('install')
        } else {
            # npm-fallback: kör inga dependency-lifecycle-skript. Det förhindrar
            # att främmande prepare/husky-script från en befintlig node_modules-
            # installation körs under restore.
            Invoke-Checked $script:PackageManager.Source @('install', '--prefix', $adminDirectory, '--ignore-scripts', '--no-package-lock', '--no-audit', '--no-fund')
        }
    }

    Write-Step 'Startar PostgreSQL/PostGIS via Docker Compose'
    $existingDbId = ((& docker compose -f $composeFile ps -q db | Out-String).Trim())
    $existingDbRunning = $false
    if ($existingDbId) {
        $existingDbRunning = ((& docker inspect --format '{{.State.Running}}' $existingDbId).Trim() -eq 'true')
    }
    Invoke-Checked 'docker' @('compose', '-f', $composeFile, 'up', '-d', 'db')
    $script:StartedDatabase = -not $existingDbRunning

    Write-Step 'Väntar på frisk databas'
    $databaseReady = $false
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        $dbId = ((& docker compose -f $composeFile ps -q db | Out-String).Trim())
        if ($dbId) {
            $health = (& docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $dbId).Trim()
            Write-Host "Databasstatus: $health"
            if ($health -eq 'healthy' -or $health -eq 'running') { $databaseReady = $true; break }
        }
        Start-Sleep -Seconds 2
    }
    if (-not $databaseReady) { throw 'Databasen blev inte frisk inom 60 sekunder.' }

    Write-Step 'Startar backend'
    $env:ConnectionStrings__Efp = 'Host=localhost;Port=5432;Database=efp;Username=efp;Password=efp-dev-password'
    $env:ASPNETCORE_URLS = 'http://localhost:8080'
    $apiLog = Join-Path $logDirectory 'api.log'
    $apiErrorLog = Join-Path $logDirectory 'api.error.log'
    $apiProcess = Start-Process -FilePath 'dotnet' -ArgumentList @('run', '--project', $apiProject, '--no-restore', '--no-launch-profile') -WorkingDirectory $repoRoot -RedirectStandardOutput $apiLog -RedirectStandardError $apiErrorLog -PassThru -NoNewWindow
    $script:StartedProcesses += $apiProcess

    Write-Step 'Startar React-admin'
    $env:VITE_API_URL = 'http://localhost:8080/api/v1'
    $adminLog = Join-Path $logDirectory 'admin.log'
    $adminErrorLog = Join-Path $logDirectory 'admin.error.log'
    if ($script:PackageManager.Name -like 'pnpm*') {
        $adminArguments = @('--dir', $adminDirectory, 'dev', '--host', 'localhost')
    } else {
        $adminArguments = @('--prefix', $adminDirectory, 'run', 'dev', '--', '--host', 'localhost')
    }
    # Get-Command hittar ofta npm.ps1/pnpm.ps1 i PowerShell. Start-Process
    # behöver däremot den körbara .cmd-wrappern för att kunna starta processen.
    $packageManagerProcessPath = Get-ProcessCommandPath $script:PackageManager
    $adminProcess = Start-Process -FilePath $packageManagerProcessPath -ArgumentList $adminArguments -WorkingDirectory $repoRoot -RedirectStandardOutput $adminLog -RedirectStandardError $adminErrorLog -PassThru -NoNewWindow
    $script:StartedProcesses += $adminProcess

    Write-Host "`nUtvecklingsmiljön är startad:" -ForegroundColor Green
    Write-Host '  Admin:   http://localhost:5173'
    Write-Host '  API:     http://localhost:8080'
    Write-Host '  OpenAPI: http://localhost:8080/openapi/v1.json'
    Write-Host '  Health:  http://localhost:8080/health'
    Write-Host "`nLoggar: $logDirectory"
    Write-Host 'Tryck Ctrl+C för att stoppa backend, frontend och databasen.'

    while ($true) {
        if ($apiProcess.HasExited) { throw "Backend avslutades oväntat med exit code $($apiProcess.ExitCode). Se $apiErrorLog" }
        if ($adminProcess.HasExited) { throw "Admin-interface avslutades oväntat med exit code $($adminProcess.ExitCode). Se $adminErrorLog" }
        Start-Sleep -Seconds 2
    }
}
catch {
    Write-Error $_
    exit 1
}
finally {
    Stop-StartedProcesses
    Stop-StartedDatabase
}

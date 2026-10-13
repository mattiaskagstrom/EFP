$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'dev-runtime.ps1')

function Assert-True($Value, [string]$Message) {
    if (-not $Value) { throw $Message }
}

# A healthy PostgreSQL process inside Docker is insufficient if the published
# Windows port is missing, as happened with the disconnected source-db-1.
$ready = Wait-DevelopmentDatabase -GetHealth { 'healthy' } -TestConnection { $false } -Delay {} -Attempts 3
Assert-True (-not $ready) 'A healthy but unreachable database must not start the backend.'

$script:connectionAttempts = 0
$ready = Wait-DevelopmentDatabase -GetHealth { 'healthy' } -TestConnection {
    $script:connectionAttempts++
    return $script:connectionAttempts -ge 3
} -Delay {} -Attempts 3
Assert-True ($ready -and $script:connectionAttempts -eq 3) 'Wait for host connectivity even after Docker reports healthy.'

$ready = Wait-DevelopmentDatabase -GetHealth { 'starting' } -TestConnection { $true } -Delay {} -Attempts 2
Assert-True (-not $ready) 'An open port alone must not bypass the database health check.'

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
try {
    $listener.Start()
    $testPort = $listener.LocalEndpoint.Port
    Assert-True (Test-TcpEndpoint -Port $testPort) 'The TCP probe must accept a reachable endpoint.'
}
finally { $listener.Stop() }
Assert-True (-not (Test-TcpEndpoint -Port $testPort)) 'The TCP probe must reject a closed endpoint.'

foreach ($exitCode in @(0, 7, $null)) {
    $fakeProcess = [pscustomobject]@{ ExitCode = $exitCode }
    $fakeProcess | Add-Member -MemberType ScriptMethod -Name WaitForExit -Value {}
    $reported = Get-ExitedProcessCode $fakeProcess
    if ($null -eq $exitCode) { Assert-True ($reported -eq 'okänd') 'An unavailable exit code must not produce an empty error message.' }
    else { Assert-True ($reported -eq $exitCode) 'The process exit code must be retained, including zero.' }
}

$bytes = [System.IO.File]::ReadAllBytes((Join-Path $PSScriptRoot 'dev.ps1'))
Assert-True ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) 'dev.ps1 needs a UTF-8 BOM so Windows PowerShell 5.1 reads Swedish messages correctly.'

Write-Host 'Development startup regression tests passed.'

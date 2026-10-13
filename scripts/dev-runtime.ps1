function Test-TcpEndpoint {
    param([string]$ComputerName = '127.0.0.1', [int]$Port = 5432, [int]$TimeoutMilliseconds = 500)
    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connection = $client.ConnectAsync($ComputerName, $Port)
        return $connection.Wait($TimeoutMilliseconds) -and $client.Connected
    }
    catch { return $false }
    finally { $client.Dispose() }
}

function Wait-DevelopmentDatabase {
    param(
        [scriptblock]$GetHealth,
        [scriptblock]$TestConnection = { Test-TcpEndpoint },
        [scriptblock]$Delay = { Start-Sleep -Seconds 2 },
        [int]$Attempts = 30
    )
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        $health = & $GetHealth
        if (($health -eq 'healthy' -or $health -eq 'running') -and (& $TestConnection)) { return $true }
        if ($attempt -lt $Attempts) { & $Delay }
    }
    return $false
}

function Get-ExitedProcessCode($Process) {
    $Process.WaitForExit()
    $code = $Process.ExitCode
    if ($null -eq $code) { return 'okänd' }
    return $code
}

param(
    [switch]$PauseOnExit
)

$ErrorActionPreference = 'Stop'

function New-SafeSecret {
    $bytes = New-Object byte[] 36
    [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    return [Convert]::ToBase64String($bytes).Replace('+', '-').Replace('/', '_').TrimEnd('=')
}

function Invoke-Psql {
    param(
        [Parameter(Mandatory = $true)][string]$Database,
        [Parameter(Mandatory = $true)][string]$User,
        [Parameter(Mandatory = $true)][string]$Password,
        [Parameter(Mandatory = $true)][string]$Sql
    )

    $previousPassword = $env:PGPASSWORD
    try {
        $env:PGPASSWORD = $Password
        $output = $Sql | & $script:PsqlPath -w -X -v ON_ERROR_STOP=1 -h localhost -p 5432 -U $User -d $Database -At 2>&1
        if ($LASTEXITCODE -ne 0) {
            throw "psql failed for database '$Database' as '$User'."
        }
        return ($output -join [Environment]::NewLine).Trim()
    }
    finally {
        if ($null -eq $previousPassword) {
            Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        }
        else {
            $env:PGPASSWORD = $previousPassword
        }
    }
}

try {
    $defaultPsql = 'C:\Program Files\PostgreSQL\18\bin\psql.exe'
    $command = Get-Command psql -ErrorAction SilentlyContinue
    if ($command) {
        $script:PsqlPath = $command.Source
    }
    elseif (Test-Path -LiteralPath $defaultPsql) {
        $script:PsqlPath = $defaultPsql
    }
    else {
        throw 'PostgreSQL 18 psql was not found.'
    }

    $repoRoot = Split-Path -Parent $PSScriptRoot
    $envPath = Join-Path $repoRoot '.env.local'
    if (Test-Path -LiteralPath $envPath) {
        $answer = Read-Host '.env.local already exists. Replace its Tapra2 database credentials? (yes/no)'
        if ($answer -ne 'yes') {
            throw 'Setup cancelled without changing the existing environment file.'
        }
    }

    Write-Host 'Tapra2 native PostgreSQL development setup' -ForegroundColor Cyan
    Write-Host 'The postgres password is used only in this process and is never written to disk.'
    $secureAdminPassword = Read-Host 'Enter the local postgres administrator password' -AsSecureString
    $adminPassword = [System.Net.NetworkCredential]::new('', $secureAdminPassword).Password

    $null = Invoke-Psql -Database 'postgres' -User 'postgres' -Password $adminPassword -Sql 'SELECT 1;'

    $ownerPassword = New-SafeSecret
    $appPassword = New-SafeSecret

    $roleSql = @"
DO `$setup`$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tapra2_owner') THEN
        CREATE ROLE tapra2_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '$ownerPassword';
    ELSE
        ALTER ROLE tapra2_owner WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '$ownerPassword';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'tapra2_app') THEN
        CREATE ROLE tapra2_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '$appPassword';
    ELSE
        ALTER ROLE tapra2_app WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD '$appPassword';
    END IF;
END
`$setup`$;
"@
    $null = Invoke-Psql -Database 'postgres' -User 'postgres' -Password $adminPassword -Sql $roleSql

    foreach ($databaseName in @('tapra2_dev', 'tapra2_test')) {
        $exists = Invoke-Psql -Database 'postgres' -User 'postgres' -Password $adminPassword -Sql "SELECT 1 FROM pg_database WHERE datname = '$databaseName';"
        if ($exists -ne '1') {
            $null = Invoke-Psql -Database 'postgres' -User 'postgres' -Password $adminPassword -Sql "CREATE DATABASE $databaseName OWNER tapra2_owner;"
        }
        $null = Invoke-Psql -Database 'postgres' -User 'postgres' -Password $adminPassword -Sql "ALTER DATABASE $databaseName OWNER TO tapra2_owner; GRANT CONNECT ON DATABASE $databaseName TO tapra2_app;"
    }

    $environment = @"
# Generated locally by scripts/setup-native-postgres.ps1. Never commit this file.
NODE_ENV=development
SERVER_PORT=3001
FRONTEND_ORIGIN=http://localhost:3000
DATABASE_MIGRATION_URL=postgresql://tapra2_owner:$ownerPassword@localhost:5432/tapra2_dev
DATABASE_URL=postgresql://tapra2_app:$appPassword@localhost:5432/tapra2_dev
TEST_DATABASE_MIGRATION_URL=postgresql://tapra2_owner:$ownerPassword@localhost:5432/tapra2_test
TEST_DATABASE_URL=postgresql://tapra2_app:$appPassword@localhost:5432/tapra2_test
SESSION_COOKIE_SECURE=false
LOG_LEVEL=info
"@
    [IO.File]::WriteAllText($envPath, $environment, [Text.UTF8Encoding]::new($false))

    Write-Host 'Tapra2 development roles and databases were created successfully.' -ForegroundColor Green
    Write-Host '.env.local was created with generated application credentials and is ignored by Git.' -ForegroundColor Green
}
catch {
    Write-Host "Setup failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
finally {
    $adminPassword = $null
    $secureAdminPassword = $null
    if ($PauseOnExit) {
        [void](Read-Host 'Press Enter to close this window')
    }
}

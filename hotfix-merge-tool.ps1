#Requires -Version 3.0
[CmdletBinding()]
Param(
    [switch]$resolved,
    [System.Collections.ArrayList]$cherrypicks
)

Import-Module ([System.IO.Path]::Combine($PSScriptRoot, './MergeHelper')) -Global -Force -ErrorAction Stop

Get-CleanWorkspace

$currentBranch = & git rev-parse --abbrev-ref HEAD

if ($resolved -ne $true) {
    Write-Host "Welcome to the Hotfix creator tool!"
    
    $environment = Get-UserInput -prompt "First, tell me the environment you are trying to hotfix. Enter 'ppe' 'production' or 'mpac'." -validInputs '(ppe)|(production)|(mpac)'
    $commit = Get-UserInput -prompt "OK, now I need the commit in master branch currently in $environment" -validInputs '(^([a-f]|[\d]){8}$)|(^([a-f]|[\d]){40})$'

    $cherrypicks = @()
    $null = Get-Cherrypicks | ForEach-Object { $cherrypicks.Add($_) }

    $hotfix = "hotfix"
    Write-Host "Thanks for the info!"

    Sync-Branch -branch master
    Sync-Branch -branch $hotfix

    & git checkout $commit

    Write-Host "Checking out $hotfix branch"
    & git checkout $hotfix

    $hotfixBranch = Get-NewBranch -branch $hotfix -commit $commit

    Write-Host "Checking out new branch $hotfixBranch"
    & git checkout -b $hotfixBranch

    git checkout $hotfixBranch

    git merge $commit

    if ($LASTEXITCODE -ne 0) {
        Write-Warning "Oh no! The merge failed. If there were merge conflicts, resolve them and then rerun this script with parameters '-resolved $true'"
        $resolved = $false
    } else {
        $resolved = $true
    }
}

if ($resolved -eq $true) {
    Invoke-Cherrypicks -cherrypicks $cherrypicks

    New-PullRequest -sourceBranch $hotfixBranch -targetBranch $hotfix

    & git checkout $currentBranch
}

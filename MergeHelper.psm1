#Requires -Version 3.0

# Get input from the user with a regular expression to test for valid inputs and ask user until they give valid input.
function Get-UserInput
{
    [cmdletbinding()]
    Param(
        [string]$prompt, [string]$validInputs
    )
    $input = Read-Host -Prompt $prompt

    $valid = $false

    while ($valid -ne $true) {
        $valid = $input -Match $validInputs
        if ($valid -eq $false) {
            $input = Read-Host -Prompt "I didn't catch that. Can you re-enter? (Valid inputs: $validInputs)"
        }
    }
    return $input
}

# Ensure the user's git workspace is clean. If not, we will exit the script.
function Get-CleanWorkspace
{
    $status = & git status -s

    if ($status -ne $null) {
        Write-Error "Uh-oh, looks like your working directory isn't clean! Commit or reset your changes and run the script again."
        exit 1
    }
}

# Obtain a list of cherry-pick commits from the user
function Get-Cherrypicks
{
    $anyCherrypicks = Get-UserInput -prompt "Do you need to cherry-pick any commits in AzureUX-Workbooks? (Yes or no)" -validInput '(y)|(n)|(yes)|(no)'
    [System.Collections.ArrayList]$cherrypicks = @()
    if ($anyCherrypicks -ieq 'y' -or $anyCherrypicks -ieq 'yes') {
        $commitList = Get-UserInput -prompt "OK, enter the commits in a comma-separated list" -validInputs '\b([a-f]|[\d]){8}'

        $null = $commitList.split(',') | ForEach-Object { $_.trim() } | ForEach-Object { $cherrypicks.Add($_) }
    }
    return $cherrypicks
}

# sync the given branch
function Sync-Branch
{
    [cmdletbinding()]
    Param(
        [string]$branch
    )
    Write-Host "Checking out $branch branch"
    & git checkout $branch

    Write-Host "Syncing..."
    & git pull
}

# create a new branch using time as part of branch name
function Get-NewBranch
{
    [cmdletbinding()]
    Param(
        [string]$branch,
        [string]$commit
    )
    $timestamp = Get-Date -format "yyyyMMdd-hhmmss"
    if ($commit -eq $null) {
        $commit = ''
    }
    if ($commit.length -gt 8) {
        $commit = $commit.Substring(0, 8) + '-'
    }
    $releaseBranch = "$commit$branch-$timestamp"

    return $releaseBranch
}

# cherry pick thte list of commits
function Invoke-Cherrypicks {
    [cmdletbinding()]
    Param(
        [System.Collections.ArrayList]$cherrypicks
    )
    Write-Host "Cherry-picking commits $cherrypicks"
    $remainingCherries = $cherrypicks;
    foreach ($c in $cherrypicks) {
        & git cherry-pick -m 1 $c
        $remainingCherries.Remove(0)
        if ($LASTEXITCODE -ne 0) {
            $remaining = $remainingCherries -join ', '
            Write-Warning "Oh no! Cherry-pick failed. If there were merge conflicts, resolve them and commit the result, then re-run this script with arguments '-resolved $true and -cherrypicks @($remaining)"
            exit 1
        }
    }
}

# Publish branch and prompt for new pull request
function New-PullRequest {
    [cmdletbinding()]
    Param(
        [string]$title,
        [string]$sourceBranch,
        [string]$targetBranch
    )
    Write-Host "Publishing branch to Github"
    & git push https://github.com/microsoft/Application-Insights-Workbooks $sourceBranch
    
    Write-Host "All done! Please create a pull request of $sourceBranch against $targetBranch here: https://github.com/microsoft/Application-Insights-Workbooks/pulls"
}

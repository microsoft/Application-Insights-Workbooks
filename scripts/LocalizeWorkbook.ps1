#----------------------------------------------------------------------------
# Functions
#------------------------------------------------------------
Function CreateNewResXFile() {
    Write-Host "Creating file  "$filename 
    New-Item -Path $path'\newfile.resx' -ItemType File 
}

Function ResXFileExists() {
    Write-Host "ResX file already exists. Overwriting file..."
}

Function ExtractStringsFromWorkbook() {
    param(
        [string] $workbookPath,
        [string] $file
    )
    $content = Get-Content -Raw -Path "$workbookPath\$file" | ConvertFrom-Json | Select-Object -expand items
    Write-Host $content
}

#----------------------------------------------------------------------------
# Script Starts Here
#------------------------------------------------------------
# arg0 expected to be the workbook to extract strings from.
# TODO: below is just for testing and debugging. Remove this when finished
$workbookPath = 'C:\src\Application-Insights-Workbooks\Workbooks\Azure Monitor - Getting Started\Resource Picker'
#  $args[0]
If (!(test-path $workbookPath)) {
    # Workbook path doesn't exist
    throw "ERROR: Could not find path '$($workbookPath)'"
}

$files = Get-ChildItem -Path $workbookPath -Name -Include "*.workbook", "*.cohort"
if ($files.Count -eq 0) {
    throw "ERROR: Did not find '.workbook' or '.cohort' files."
} elseif ($files.Count -ne 1) {
    throw "ERROR: There should be only one '.workbook' or '.cohort' file in this directory."
} else {
    Write-Host "Found file(s): '$($files)'"
}

foreach ($file in $files) {
    ExtractStringsFromWorkbook $workbookPath $file
}

Write-Host "Completed."

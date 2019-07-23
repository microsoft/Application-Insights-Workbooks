
# This script transforms the repo into a json with the following structure:

# Root
#  |
#  |- Workbooks (reportFolder)
#        |- Performance (categoryFolder)
#             |- Apdex (templateFolder)
#                 |- en
#                 |   |- settings.json
#                 |   |- readme.md
#                 |   |- Apdex.workbook
#                 |- ko
#                     |- settings.json
#                     |- readme.md
#                     |- Apdex.workbook
# 
# If the transformation is successful the json gets published as artifact
#
# There are no parameters required.

$mainPath = Split-Path (split-path -parent $MyInvocation.MyCommand.Path) -Parent

Write-Host "Using Folder $mainPath as root"

$reports = Get-ChildItem $mainPath
$reportTypes = @('Cohorts', 'Workbooks')
$templateExtensions = @('cohort', 'workbook')
$defaultLanguage = 'en-us'
$payload = @{ }

Function GetTemplateContainerData() {
    param(
        [String] $templateFolderPath
    )
    
    $templateMetadata = @{ }

    $templateFiles = Get-ChildItem $templateFolderPath 

    $hasFoundTemplateContent = $false

    foreach ($templateFile in $templateFiles) {

        if ($templateFile.Name -eq 'settings.json') {
            $templateSettings = Get-Content $templateFile.FullName | Out-String | ConvertFrom-Json 
    
            $templateMetadata.name = $templateSettings.name
            $templateMetadata.author = $templateSettings.author
            $templateMetadata.description = $templateSettings.author
            $templateMetadata.tags = $templateSettings.tags
            $templateMetadata.galleries = $templateSettings.galleries
            $templateMetadata.iconUrl = $templateSettings.Icon
            $templateMetadata.isPreview = $templateSettings.isPreview
        }
        elseif ($templateExtensions.Contains($templateFile.Name.split(".")[-1])) {

            if ($hasFoundTemplateContent) {
                throw "There cannot be more than one content file per template $templateFolderPath"
            }

            $hasFoundTemplateContent = $true

            # This is the template content for default language
            $templateMetadata.Content = Get-Content $templateFile.FullName | Out-String
    
        }
    }

    return $templateMetadata;
}

Write-Host "Building template's json"

foreach ($report in $reports) {
    $reportType = $report.Name

    if ($reportTypes.Contains($reportType)) {

        $payload.$reportType = @{ }

        $categories = Get-ChildItem $report.FullName

        foreach ($category in $categories) {

            $categoryName = $category.Name

            $payload.$reportType.$categoryName = @{ }

            $templates = Get-ChildItem $category.FullName 

            $payload.$reportType.$categoryName.ReportName = $reportType
            $payload.$reportType.$categoryName.CategoryName = $categoryName
            $payload.$reportType.$categoryName.TemplateContainers = @()

            foreach ($templateFolder in $templates) {

                # Add category metadata
                if ($templateFolder.Name -eq 'categoryResources.json') {
                  
                    $payload.$reportType.$categoryName.SortOrderByLanguage = @{ }
                    $payload.$reportType.$categoryName.NameByLanguage = @{ }
                    $payload.$reportType.$categoryName.DescriptionByLanguage = @{ }

                    $categoryResources = Get-Content $templateFolder.FullName | Out-String | ConvertFrom-Json 
                    $categoryResources | Get-Member -type NoteProperty | Foreach {
                        $languageProperties = $categoryResources.($_.name)

                        $payload.$reportType.$categoryName.SortOrderByLanguage.($_.name) = $languageProperties.order
                        $payload.$reportType.$categoryName.NameByLanguage.($_.name) = $languageProperties.name
                        $payload.$reportType.$categoryName.DescriptionByLanguage.($_.name) = $description.order
                    }
                }
                # Process template folder
                elseif ($templateFolder -is [System.IO.DirectoryInfo]) {
                    $templateFiles = Get-ChildItem $templateFolder.FullName
                    $templateMetadata = @{ }
                    $templateMetadata.TemplateByLanguage = @{ }
                    $templateMetadata.Name = $templateFolder.Name

                    #First get template populate template data for default language, which is a top level
                    $templateMetadata.TemplateByLanguage.$defaultLanguage = GetTemplateContainerData $templateFolder.FullName

                    #Then look at any subfolders which correspond to localized data
                    foreach ($templateSubfolders in $templateFiles) {

                        if ($templateSubfolders -is [System.IO.DirectoryInfo]) {
                            $templateMetadata.TemplateByLanguage.($templateSubfolders.name) = GetTemplateContainerData $templateSubfolders.FullName
                        }
                    }

                    # Add Template container
                    $payload.$reportType.$categoryName.TemplateContainers += $templateMetadata

                }
            }
        }
    }
}

Write-Host "Done building json"

Write-Host "Copying artifacts"

$artifactContent = $payload | ConvertTo-Json -depth 10

New-Item -Path $env:BUILD_ARTIFACTSTAGINGDIRECTORY -Name "templates.json" -ItemType "file" -Value $artifactContent

Write-Host "Done copying artifacts"
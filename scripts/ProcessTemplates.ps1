
$mainPath = Split-Path (split-path -parent $MyInvocation.MyCommand.Path) -Parent

$reports = Get-ChildItem $mainPath
$reportTypes = @('Cohorts', 'Workbooks')
$templateExtensions = @('cohort', 'workbook')
$defaultLanguage = 'en-us'
$payload = @{ }
$categoryMetadataFileName = 'categoryResources.json'

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

            # Build path of file
            $templateFolderName = Split-Path $templateFolderPath -Leaf
            $templateCategoryFolderPath = Split-Path $templateFolderPath
            $templateCategory = Split-Path $templateCategoryFolderPath -Leaf
            $templateReportTypePath = Split-Path $templateCategoryFolderPath
            $templateReportType = Split-Path $templateReportTypePath -Leaf
    
            $templateMetadata.path = "$templateReportType/$templateCategory/$templateFolderName"
            $templateMetadata.name = $templateSettings.name
            $templateMetadata.author = $templateSettings.author
            $templateMetadata.description = $templateSettings.description
            $templateMetadata.tags = $templateSettings.tags
            $templateMetadata.galleries = $templateSettings.galleries
            $templateMetadata.iconUrl = $templateSettings.icon
            $templateMetadata.readme = $templateSettings.readme
            $templateMetadata.isPreview = $templateSettings.isPreview
        }
        elseif ($templateExtensions.Contains($templateFile.Name.split(".")[-1])) {

            if ($hasFoundTemplateContent) {
                throw "There cannot be more than one content file per template $templateFolderPath"
            }

            $hasFoundTemplateContent = $true

            # This is the template content for default language
            $templateMetadata.Content = Get-Content $templateFile.FullName -Encoding UTF8 | Out-String

        }
    }

    if ( $null -eq $templateMetadata.path -or $null -eq $templateMetadata.Content) {
        throw "Template in folder $templateFolderPath is missing properties"
    }

    return $templateMetadata;
}

Function AddCategory() {
    param(
        [string] $categoryName,
        [Object] $categories,
        [Object] $categorySettings
    )

    if ($categories.$categoryName) {
        throw "Cannot have duplicate category names ($categoryName)"
    }

    $categories.$categoryName = @{ }

    $categories.$categoryName.ReportName = $reportType
    $categories.$categoryName.CategoryName = $categoryName
    $categories.$categoryName.TemplateContainers = @()

    $categories.$categoryName.SortOrderByLanguage = @{ }
    $categories.$categoryName.NameByLanguage = @{ }
    $categories.$categoryName.DescriptionByLanguage = @{ }

    $categorySettings | Get-Member -type NoteProperty | Foreach-Object {
        $languageProperties = $categorySettings.($_.name)

        $categories.$categoryName.SortOrderByLanguage.($_.name) = $languageProperties.order
        $categories.$categoryName.NameByLanguage.($_.name) = $languageProperties.name
        $categories.$categoryName.DescriptionByLanguage.($_.name) = $languageProperties.description
    }
}

Function AddVirtualCategories() {
    param(
        [Object] $categories,
        [string] $categoriesMetadataFilePath
    )

    $virtualCategoriesSettings = Get-Content $categoriesMetadataFilePath | Out-String | ConvertFrom-Json 

    foreach ($virtualCategory in $virtualCategoriesSettings.categories) {

        AddCategory $virtualCategory.key $categories $virtualCategory.settings
    }
}

Function AddTemplatesToVirtualGallery() {

    param(
        [Object] $templateMetadata
    )

    $virtualGalleries = $templateMetadata.TemplateByLanguage.$defaultLanguage.galleries | Where-Object { ($null -ne $_.categoryKey) -and $payload.$reportType.($_.categoryKey) }

    if ($null -ne $virtualGalleries) {

        # Only keep non-virtual galleries in path category
        $nonVirtualGalleries = $templateMetadata.TemplateByLanguage.$defaultLanguage.galleries | Where-Object { $null -eq $_.categoryKey }
        if ($null -eq $nonVirtualGalleries) {
            $templateMetadata.TemplateByLanguage.$defaultLanguage.galleries = @()
        }
        elseif ($null -eq $nonVirtualGalleries.Count) {
            $templateMetadata.TemplateByLanguage.$defaultLanguage.galleries = @($nonVirtualGalleries)
        }
        else {
            $templateMetadata.TemplateByLanguage.$defaultLanguage.galleries = $nonVirtualGalleries
        }

        # Means there is only one Virtual gallery, so virtual galleries is an object not a list
        if ($null -eq $virtualGalleries.Count) {
            $newTemplateData = (Copy-Object  $templateMetadata)[0]

            $newTemplateData.TemplateByLanguage.$defaultLanguage.galleries = @($virtualGalleries)
            $payload.$reportType.($virtualGalleries.categoryKey).TemplateContainers += $newTemplateData
        }
        else {
            $virtualGalleries | ForEach-Object {

                $newTemplateData = (Copy-Object  $templateMetadata)[0]
                $newTemplateData.TemplateByLanguage.$defaultLanguage.galleries = @($_)
                $payload.$reportType.($_.categoryKey).TemplateContainers += $newTemplateData
            }
        }
    }
}

function Copy-Object {
    param($DeepCopyObject)
    $memStream = new-object IO.MemoryStream
    $formatter = new-object Runtime.Serialization.Formatters.Binary.BinaryFormatter
    $formatter.Serialize($memStream, $DeepCopyObject)
    $memStream.Position = 0
    $formatter.Deserialize($memStream)

    return $formatter
}

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
# -------------------------

Write-Host "Building template's json"

foreach ($report in $reports) {
    $reportType = $report.Name

    if ($reportTypes.Contains($reportType)) {

        $payload.$reportType = @{ }

        $categories = Get-ChildItem $report.FullName

        #Add virtual categories
        $virtualCategoriesPath = Join-Path $report.FullName $categoryMetadataFileName 
        if ([System.IO.File]::Exists($virtualCategoriesPath)) {

            AddVirtualCategories $payload.$reportType  $virtualCategoriesPath
        }

        foreach ($category in $categories) {

            # Skip if this is the top level categories file (virtual categories), since it was already processed
            if ($category.Name -eq $categoryMetadataFileName) {
                continue
            }

            $categoryName = $category.Name
            $templates = Get-ChildItem $category.FullName 

            $categorySettingsPath = Join-Path $category.FullName $categoryMetadataFileName 
            $categorySettings = Get-Content $categorySettingsPath | Out-String | ConvertFrom-Json 

            AddCategory $categoryName ($payload.$reportType) $categorySettings

            foreach ($templateFolder in $templates) {
                
                if ($templateFolder -is [System.IO.DirectoryInfo]) {
                    $templateFiles = Get-ChildItem $templateFolder.FullName
                    $templateMetadata = @{ }
                    $templateMetadata.TemplateByLanguage = @{ }
                    $templateMetadata.Name = $templateFolder.Name

                    # First get template populate template data for default language, which is a top level
                    $templateMetadata.TemplateByLanguage.$defaultLanguage = GetTemplateContainerData $templateFolder.FullName

                    AddTemplatesToVirtualGallery $templateMetadata

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

$artifactContent = $payload | ConvertTo-Json -depth 10 -Compress

cd $mainPath
mkdir "output"

$artifactContent | Out-File -FilePath "$mainPath\output\ProcessedTemplates.json"

Write-Host "Done copying artifacts"

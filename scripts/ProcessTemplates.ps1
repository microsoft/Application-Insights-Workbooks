$mainPath = Split-Path (split-path -parent $MyInvocation.MyCommand.Path) -Parent
$localizeRoot = Convert-Path "$mainPath\scripts"
$outputPath = "$mainPath\output"

$reportTypes = @('Cohorts', 'Workbooks')
$templateExtensions = @('cohort', 'workbook')
$defaultLanguage = 'en-us'
$payload = @{ }
$categoryMetadataFileName = 'categoryResources.json'

# This is the name of where the blob that ALM looks for
$azureBlobFileNameBase = "community-templates-V2";

$repoBaseName = "Application-Insights-Workbooks"
$supportedLanguages = @(
    "cs-cz", 
    "de-de",
    $defaultLanguage, 
    "es-es", 
    "fr-fr", 
    "hu-hu", 
    "it-it", 
    "ja-jp", 
    "ko-kr",
    "nl-nl", 
    "pl-pl", 
    "pt-br", 
    "pt-pt", 
    "ru-ru", 
    "sv-se", 
    "tr-tr", 
    "zh-cn", 
    "zh-tw" 
)
$docGitServer = "https://github.com/MicrosoftDocs/"

#----------------------------------------------------------------------------
# GetTemplateContainerData
#----------------------------------------------------------------------------
Function GetTemplateContainerData() {
    param(
        [String] $templateFolderPath,
        [String] $language
    )   
    
    $templateMetadata = @{ }

    CopyFromEnuIfNotExist $templateFolderPath $language
    $templateFiles = Get-ChildItem $templateFolderPath

    $hasFoundTemplateContent = $false

    foreach ($templateFile in $templateFiles) {

        if ($templateFile.Name -eq 'settings.json') {
            $templateSettings = Get-Content $templateFile.FullName -Encoding UTF8 | Out-String | ConvertFrom-Json 

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

#----------------------------------------------------------------------------
# AddCategory
#----------------------------------------------------------------------------
Function AddCategory() {
    param(
        [string] $categoryName,
        [Object] $categories,
        [Object] $categorySettings,
        [string] $language
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
        # only process language in categoryResources.json
        if ($_.name -eq $language) {
            $languageProperties = $categorySettings.($_.name)

            $categories.$categoryName.SortOrderByLanguage.($_.name) = $languageProperties.order
            $categories.$categoryName.NameByLanguage.($_.name) = $languageProperties.name
            $categories.$categoryName.DescriptionByLanguage.($_.name) = $languageProperties.description
        }
    }
}

#----------------------------------------------------------------------------
# AddVirtualCategories
#----------------------------------------------------------------------------
Function AddVirtualCategories() {
    param(
        [Object] $categories,
        [string] $categoriesMetadataFilePath,
        [string] $language
    )

    $virtualCategoriesSettings = Get-Content $categoriesMetadataFilePath -Encoding UTF8 | Out-String | ConvertFrom-Json 

    foreach ($virtualCategory in $virtualCategoriesSettings.categories) {

        AddCategory $virtualCategory.key $categories $virtualCategory.settings $language
    }
}

#----------------------------------------------------------------------------
# AddTemplatesToVirtualGallery
#----------------------------------------------------------------------------
Function AddTemplatesToVirtualGallery() {

    param(
        [Object] $templateMetadata,
        [String] $language
    )

    $lang = CheckLanguageOrUseDefault $language

    $virtualGalleries = $templateMetadata.TemplateByLanguage.$lang.galleries | Where-Object { ($null -ne $_.categoryKey) -and $payload.$reportType.($_.categoryKey) }

    if ($null -ne $virtualGalleries) {

        # Only keep non-virtual galleries in path category
        $nonVirtualGalleries = $templateMetadata.TemplateByLanguage.$lang.galleries | Where-Object { $null -eq $_.categoryKey }
        if ($null -eq $nonVirtualGalleries) {
            $templateMetadata.TemplateByLanguage.$lang.galleries = @()
        }
        elseif ($null -eq $nonVirtualGalleries.Count) {
            $templateMetadata.TemplateByLanguage.$lang.galleries = @($nonVirtualGalleries)
        }
        else {
            $templateMetadata.TemplateByLanguage.$lang.galleries = $nonVirtualGalleries
        }

        # Means there is only one Virtual gallery, so virtual galleries is an object not a list
        if ($null -eq $virtualGalleries.Count) {
            $newTemplateData = (Copy-Object  $templateMetadata)[0]

            $newTemplateData.TemplateByLanguage.$lang.galleries = @($virtualGalleries)
            $payload.$reportType.($virtualGalleries.categoryKey).TemplateContainers += $newTemplateData
        }
        else {
            $virtualGalleries | ForEach-Object {

                $newTemplateData = (Copy-Object  $templateMetadata)[0]
                $newTemplateData.TemplateByLanguage.$lang.galleries = @($_)
                $payload.$reportType.($_.categoryKey).TemplateContainers += $newTemplateData
            }
        }
    }
}

#----------------------------------------------------------------------------
# Copy-Object
#----------------------------------------------------------------------------
function Copy-Object {
    param($DeepCopyObject)
    $memStream = new-object IO.MemoryStream
    $formatter = new-object Runtime.Serialization.Formatters.Binary.BinaryFormatter
    $formatter.Serialize($memStream, $DeepCopyObject)
    $memStream.Position = 0
    $formatter.Deserialize($memStream)

    return $formatter
}

#----------------------------------------------------------------------------
# CloneAndPullLocalizedRepos
#----------------------------------------------------------------------------
Function CloneAndPullLocalizedRepos {
    # repros will be downloaded to .\scripts folder
    # to make this run like pipeline build, we'll only clone the repo and not due a pul
    # for testing, delete the repos each time
    $rootPath = $localizeRoot

    Push-Location
    foreach ($lang in $supportedLanguages) {
        if ($lang -eq $defaultLanguage) {
            continue;
        }
        $repoName = "$repoBaseName.$lang"
        $repoPath = "$rootPath\$repoName"
        if (Test-Path $repoPath) {
            Write-Host "Repo exist on disk, skipping $repoPath ..."
            #Set-Location -Path $repoPath
            #git pull
        } else {
            Write-Host "Cloning $docGitServer$repoName.git at $repoPath ..."
            git clone "$docGitServer$repoName.git" $repoPath
        }
    }
    Pop-Location
}

#----------------------------------------------------------------------------
# CopyFromEnuIfNotExist
#----------------------------------------------------------------------------
Function CopyFromEnuIfNotExist() {
    param(
        [string] $fullName,
        [string] $language
        )

    # skip if language is not in the supported list
    $lang = CheckLanguageOrUseDefault $language
    if ($lang -ne $language) {
        return
    }

    $enuPath = $fullName.Replace("$localizeRoot\$repoBaseName.$language", $mainPath)
    if (!(Test-Path $enuPath)) {
        return
    }
    $enuFiles = Get-ChildItem $enuPath

    foreach($enuFile in $enuFiles) {
        $fileName = $enuFile.Name
        $destinationFile = "$fullName\$fileName"
        if (!(Test-Path $destinationFile)) {
            if ($fileName -like "*.workbook") {
                $existingWorkbooks = Get-ChildItem -Path "$fullName\*" -Include *.workbook
                if ($existingWorkbooks.Count -ne 0) {
                    Write-Host ">>>>>> Skipping .workbook in $existingWorkbooks <<<<<<<<"
                    continue
                }    
            }

            $fullPath = $enuFile.FullName
            Write-Host "[#WARNING: missing File]: copying file $fullPath to $fullName"
            # copy file from enu to localized folder
            Copy-Item -Path $fullPath -Destination $fullName
            # check and replace "en-us" with the language for any *.json file
            if (Test-Path $destinationFile -PathType leaf -Include "*.json") {
                $from = """$defaultLanguage"""
                $to = """$language"""
                Write-Host "[#WARNING: missing File]: ...found $destinationFile and replacing $from with $to"
                ((Get-Content -Path $destinationFile -Raw) -replace $from, $to) | Set-Content -Path $destinationFile
            }
        }
    }
}

#----------------------------------------------------------------------------
# CheckLanguageOrUseDefault
#----------------------------------------------------------------------------
Function CheckLanguageOrUseDefault() {
    param(
        [string] $language
    )

    if ($supportedLanguages.Contains($language)) {
        return $language
    } else {
        return $defaultLanguage
    }
}

#----------------------------------------------------------------------------
# BuildingTemplateJson
#----------------------------------------------------------------------------
Function BuildingTemplateJson() {
    param(
        [string] $jsonFileName,
        [string] $language,
        [string] $outputPath
        )

    $currentPath = get-location
    Write-Host ">>>>> Building template json: $jsonFileName in directory $currentPath ..."
    
    $lang = CheckLanguageOrUseDefault $language

    $reports = Get-ChildItem $currentPath
    # initialize the payload
    $payload = @{ }

    foreach ($report in $reports) {
        $reportType = $report.Name

        if ($reportTypes.Contains($reportType)) {

            $payload.$reportType = @{ }

            $categories = Get-ChildItem $report.FullName

            #Add virtual categories
            $virtualCategoriesPath = Join-Path $report.FullName $categoryMetadataFileName 
            if ([System.IO.File]::Exists($virtualCategoriesPath)) {

                AddVirtualCategories $payload.$reportType $virtualCategoriesPath $lang
            }

            foreach ($category in $categories) {

                # Skip if this is the top level categories file (virtual categories), since it was already processed
                if ($category.Name -eq $categoryMetadataFileName) {
                    continue
                }

                $categoryName = $category.Name

                CopyFromEnuIfNotExist $category.FullName $language
                $templates = Get-ChildItem $category.FullName

                $categorySettingsPath = Join-Path $category.FullName $categoryMetadataFileName 
                $categorySettings = Get-Content $categorySettingsPath -Encoding UTF8 | Out-String | ConvertFrom-Json 

                AddCategory $categoryName ($payload.$reportType) $categorySettings $lang

                foreach ($templateFolder in $templates) {
                    
                    if ($templateFolder -is [System.IO.DirectoryInfo]) {
                        CopyFromEnuIfNotExist $templateFolder.FullName $language
                        $templateFiles = Get-ChildItem $templateFolder.FullName
                        $templateMetadata = @{ }
                        $templateMetadata.TemplateByLanguage = @{ }
                        $templateMetadata.Name = $templateFolder.Name

                        # First get template populate template data for default language, which is a top level
                        $templateMetadata.TemplateByLanguage.$lang = GetTemplateContainerData $templateFolder.FullName $language

                        AddTemplatesToVirtualGallery $templateMetadata $language

                        #Then look at any subfolders which correspond to localized data
                        foreach ($templateSubfolders in $templateFiles) {

                            if ($templateSubfolders -is [System.IO.DirectoryInfo]) {                            
                                $templateMetadata.TemplateByLanguage.($templateSubfolders.name) = GetTemplateContainerData $templateSubfolders.FullName $language
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

    # create output folder if it doesn't exist
    if (!(Test-Path $outputPath)) {
        mkdir $outputPath
    }

    # delete existing json file
    if (Test-Path "$outputPath\$jsonFileName") {
        Remove-Item "$outputPath\$jsonFileName"
    }

    $artifactContent | Out-File -FilePath "$outputPath\$jsonFileName"
    Write-Host "... DONE building template: $outputPath\$jsonFileName <<<<<"
}

#----------------------------------------------------------------------------
# Main
#----------------------------------------------------------------------------
# merge the templates file into a json for each language
#
# community-templates-V2.json:
# Root
#  |- Workbooks (reportFolder)
#        |- Performance (categoryFolder)
#             |- Apdex (templateFolder)
#                 |- en
#                 |   |- settings.json
#                 |   |- readme.md
#                 |   |- Apdex.workbook
#
# community-templates-V2.ko-kr.json:
# Root
#  |- Workbooks (reportFolder)
#        |- Performance (categoryFolder)
#             |- Apdex (templateFolder)
#                 |- ko
#                     |- settings.json
#                     |- readme.md
#                     |- Apdex.workbook        
#----------------------------------------------------------------------------

# pull down all localized repos if run locally
Write-Host "Get Localized Repos"
CloneAndPullLocalizedRepos

# save default path
Push-Location

# process localized repo
foreach ($lang in $supportedLanguages) {
    if ($lang -eq $defaultLanguage) {
        $repoName = $repoBaseName
        $currentPath = $mainPath
    } else {
        $repoName = "$repoBaseName.$lang"
        $currentPath = Convert-Path "$localizeRoot\$repoName"
    }
    Set-Location -Path $currentPath
    $jsonFileName = "$azureBlobFileNameBase.$lang.json"

    Write-Host ""
    Write-Host "Processing..."
    Write-Host "...Repo: $repoName"
    Write-Host "...Language: $lang"
    Write-Host "...Directory: $currentPath"
    Write-Host "...OutputFile: $jsonFileName"

    BuildingTemplateJson $jsonFileName $lang $outputPath
}

# restore default path
Pop-Location

# duplicate json for en-us to be compatible with existing process
Copy-Item -Path $outputPath\$azureBlobFileNameBase.$defaultLanguage.json -Destination $outputPath\$azureBlobFileNameBase.json

Write-Host "Done copying artifacts Existing"

$mainPath = Split-Path (split-path -parent $MyInvocation.MyCommand.Path) -Parent
$localizeRoot = Convert-Path "$mainPath\scripts"
$outputPath = "$mainPath\output"

#$reportTypes = @('Cohorts', 'Workbooks')
$reportTypes = @('Cohorts')
$templateExtensions = @('cohort', 'workbook')
$defaultLanguage = 'en-us'
$payload = @{ }
$categoryMetadataFileName = 'categoryResources.json'

# This is the name of where the blob that ALM looks for
$azureBlobFileNameBase = "community-templates-V2";

$repoBaseName = "Application-Insights-Workbooks"
$supportedLanguages = @(
    $defaultLanguage,
    "cs-cz",
    "de-de",
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

    Write-Host "Adding virtual caregories from $categoriesMetadataFilepath"

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
    # repos will be downloaded to .\scripts folder
    # to make this run like pipeline build, we'll only clone the repo and not due a pul
    # for testing, delete the repos each time
    $rootPath = $localizeRoot

    Push-Location
    foreach ($lang in $supportedLanguages) {
        if ($lang -eq $defaultLanguage) {
            continue;
        }
        $repoName = "$repoBaseName.$lang"
        $repoPath = "$rootPath\$lang"
        if (Test-Path $repoPath) {
            Write-Host "Repo exist on disk, skipping $repoName ..."
        } else {
            Write-Host "Cloning $docGitServer$repoName.git at $repoPath ..."
            git clone --single-branch --branch master --no-tags "$docGitServer$repoName.git" $repoPath
        }
    }
    Pop-Location
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
                $templates = Get-ChildItem $category.FullName

    
                $categorySettingsPath = Join-Path $category.FullName $categoryMetadataFileName 
                if ($false -eq (Test-Path -Path $categorySettingsPath -PathType Leaf)) {
                    # need to use the default language one, why didn't this get copied?
                }

                $categorySettings = Get-Content $categorySettingsPath -Encoding UTF8 | Out-String | ConvertFrom-Json 

                AddCategory $categoryName ($payload.$reportType) $categorySettings $lang

                foreach ($templateFolder in $templates) {
                    
                    if ($templateFolder -is [System.IO.DirectoryInfo]) {
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

#--------------------------------------------------------------------------------------------------
# SECTION - new methods for creating package content.  hypothetically 
# almost everything above here will completely go away once the package
# stuff is finished
#--------------------------------------------------------------------------------------------------


#----------------------------------------------------------------------------
# GetFieldForLanguage
# given an object like {
#    "en-us": { someobject },
#    "cs-cz": { someotherobject }
#}
# return the field value for the specific language, or fall back to en-us
#----------------------------------------------------------------------------
Function GetValueForLanguageOrDefault() {
    param(
        [object] $object,
        [string] $language
    )

    # the name is either in a language specific field OR in en-us (even in the localized repos!)
    $info = $object.$($language);
    if ($null -eq $info) {
        $info = $object.$($defaultLanguage);
    }
    return $info
}

#----------------------------------------------------------------------------
# Create a category object with key and other metadata
#----------------------------------------------------------------------------
Function CreateCategory() {
    param(
        [string] $key,
        [object] $metadata
    )

    $c = @{}
    $c.key = $key
    $c.name = $metadata.name
    if (![string]::IsNullOrWhitespace($metadata.description)) {
        $c.description = $metadata.description
    }
    if ($null -ne $metadata.order) {
        $c.order = $metadata.order
    }

    return $c
}

#----------------------------------------------------------------------------
# LoadCategoriesJson
# loads a categories.json file and returns category info. because it could be
# virtual categories, this returns an array of metadata
#----------------------------------------------------------------------------
Function LoadCategoriesJson() {
    param(
        [string] $categoriesMetadataFilePath,
        [string] $language
    )

    $virtualCategoriesSettings = Get-Content $categoriesMetadataFilePath -Encoding UTF8 | Out-String | ConvertFrom-Json 

    $result = @()

    # if the file has a categories field, this is virtual categories
    if ($null -ne $virtualCategoriesSettings.categories) {
        foreach ($category in $virtualCategoriesSettings.categories) {
            $info = GetValueForLanguageOrDefault $category.settings $language
            if ($null -ne $info) {
                $result += CreateCategory $category.key $info
            }
        }
    } else {
        # otherwise, this is the category info for a single folder, the key is the folder name
        # TODO: this implies nested folders could end up with duplicate category info?
        $templateFolderPath = Split-Path $categoriesMetadataFilePath -Parent
        $templateCategory = Split-Path $templateFolderPath -Leaf

        # the name is either in a language specific field OR in en-us (even in the localized repos!)
        $info = GetValueForLanguageOrDefault $virtualCategoriesSettings $language
        if ($null -ne $info) {
            $result += CreateCategory $templateCategory $info
        }
    }
    return $result
}

Function CreateOrderedTemplate() {
    param([object] $metadata, 
          [object] $order)

    $result = @{}
    # these are required and should be there
    $result.name = $metadata.name
    $result.order = $order
    $result.id = $metadata.id

    # only copy other fields that are actually set
    if (![string]::IsNullOrWhitespace($metadata.filename)) {
        $result.filename = $metadata.filename
    }
    if (![string]::IsNullOrWhitespace($metadata.author)) {
        $result.author = $metadata.author
    }
    if (![string]::IsNullOrWhitespace($metadata.description)) {
        $result.description = $metadata.description
    }
    if ($null -ne $metadata.tags) {
        $result.tags = $metadata.tags
    }
    if (![string]::IsNullOrWhitespace($metadata.icon)) {
        $result.iconUrl = $metadata.icon
    }
    if (![string]::IsNullOrWhitespace($metadata.readme)) {
        $result.readme = $metadata.readme
    }
    if ($null -ne $metadata.isPreview) {
        $result.isPreview = $metadata.isPreview
    }

    return $result
}

#----------------------------------------------------------------------------
# LoadSettingsJson
# loads a settings.json file and returns workbook metadata
#----------------------------------------------------------------------------
Function LoadSettingsJson() {
    param([string] $filepath)
    $templateSettings = Get-Content $filepath -Encoding UTF8 | Out-String | ConvertFrom-Json 

    # Build path of file
    $templateFolderPath = Split-Path $filepath -Parent
    $templateFolderName = Split-Path $templateFolderPath -Leaf
    $templateCategoryFolderPath = Split-Path $templateFolderPath
    $templateCategory = Split-Path $templateCategoryFolderPath -Leaf
    $templateReportTypePath = Split-Path $templateCategoryFolderPath
    $templateReportType = Split-Path $templateReportTypePath -Leaf

    # path here should really be called "id" as it is the id of the template
    # at some point, we'll need to support aliases or moving of templates so we need to
    # split the id from the filename
    $templateMetadata = @{}
    $templateMetadata.category = $templateCategory
    $templateMetadata.id = "$templateReportType/$templateCategory/$templateFolderName"
    # for now, all of the template in the package are just .json to simplify deployment and not need special rules for .cohort, .workbook on web services for content type
    # and replace any / in filenames with - to avoid any filesystem issues
    $templateMetadata.filename = "$templateCategory-$templateFolderName.json".Replace("/", "-")
    $templateMetadata.name = $templateSettings.name
    $templateMetadata.author = $templateSettings.author
    # only copy fields that are actually set
    if (![string]::IsNullOrWhitespace($templateSettings.description)) {
        $templateMetadata.description = $templateSettings.description
    }
    if ($null -ne $templateSettings.tags) {
        $templateMetadata.tags = $templateSettings.tags
    }
    if ($null -ne $templateSettings.galleries) {
        $templateMetadata.galleries = $templateSettings.galleries
    }
    if (![string]::IsNullOrWhitespace($templateSettings.icon)) {
        $templateMetadata.iconUrl = $templateSettings.icon
    }
    if (![string]::IsNullOrWhitespace($templateSettings.readme)) {
        $templateMetadata.readme = $templateSettings.readme
    }
    if ($null -ne $templateSettings.isPreview) {
        $templateMetadata.isPreview = $templateSettings.isPreview
    }

    return $templateMetadata
}

#----------------------------------------------------------------------------
# create the package content for a given language
# produce an "gallery.json" file that contains all of the templates by type/gallery
# produce an "index.json" that is a map of every template id to path
# and a folder of all those templates
#----------------------------------------------------------------------------
Function CreatePackageContent() {
    param(
        [string] $language,
        [string] $outputPath
        )

    $currentPath = get-location
    Write-Host ">>>>> Building package content for $language in directory $currentPath ..."

    # create output folder if it doesn't exist
    if (!(Test-Path $outputPath)) {
        mkdir $outputPath | Out-Null 
    }

    $packagePath = "$outputPath\package"

    if (!(Test-Path $packagePath)) {
        mkdir $packagePath | Out-Null 
    }

    $language = CheckLanguageOrUseDefault $language
    if (!(Test-Path "$packagePath\$language")) {
        mkdir "$packagePath\$language" | Out-Null 
    }

    for ($i = 0; $i -lt $reportTypes.length; $i++) {
        $reporttype = $reportTypes[$i]
        $extension = $templateExtensions[$i]

        Write-Host "Building gallery:$reporttype $language..."

        $reportTypePath = "$packagePath\$language\$reporttype"

        if (!(Test-Path $reportTypePath)) {
            mkdir $reportTypePath | Out-Null 
        }


        $fullGallery = @{}
        $index = @{}
        $allCategories = @{}
        # find all the important files and run one pass for each kind
        # 1) categoryresources.json - to create virtual galleries
        # 2) settings.json, to find all the workbooks and what galleries they are in

        $categories = Get-ChildItem "$currentPath\$reporttype" -Recurse -file -Include "categoryresources.json"
        foreach ($categoryFile in $categories) {
            $categoryMetadatas = LoadCategoriesJson $categoryFile $language
            if ($null -eq $categoryMetadatas -or 0 -eq $categoryMetadatas.Count) {
                Write-Host "WARNING: ignoring $($categoryFile.FullName) because it has no categories for $language"
                continue;
            }

            foreach ($category in $categoryMetadatas) {
                if ($null -ne $allCategories.$($category.key)) {
                    Write-Host "WARNING: $($categoryFile.FullName) for $language contained duplicate category $($category.key)"
                }
                $allCategories.$($category.key) = $category
            }
        }
        
        $settings = Get-ChildItem "$currentPath\$reporttype" -Recurse -file -Include "settings.json"
        foreach ($settingFile in $settings) {
            # foreach settings file, find the first item in the folder and warn if there's more than one
            $folder = Split-path $settingFile.FullName -Parent
            $languageSpecifictemplates = $null;

            # SPECIAL CASES!  if this folder has a subfolder with the language in it, grab the contents from there instead!
            $overrideLanguagePath = "$folder\$language"
            if (Test-Path $overrideLanguagePath) {
                # if there's a language specific settings json, grab that
                if (Test-Path "$overrideLanguagePath\settings.json") {
                    $settingsFile = Get-ChildItem $overrideLanguagePath -file -filter "settings.json"
                }
                # see if there's language specific templates
                $languageSpecificTemplates = Get-ChildItem $overrideLanguagePath -file -filter "*.$extension"
            }

            # if there's a language specific template, use those
            if ($languageSpecificTemplates -eq $null -or $languageSpecificTemplates.Count -eq 0) {
                $templates = Get-ChildItem $folder -file -filter "*.$extension"
            } else {
                Write-Host "INFO: $folder has language specific template for $language"
                $templates = $languageSpecificTemplates
            }

            if ($templates.Count -eq 0) {
                Write-Host "WARNING: ignoring $($settingFile.FullName) because it has no .$extension file"
                continue
            } elseif ($templates.Count -gt 1) {
                Write-Host "WARNING: ignoring extra files in $($settingFile.FullName), only the first .$extension file will be used"
                Write-Host "-- (found $($templates.Count) : $templates)"
            }
            $template = $templates[0]

            $setting = LoadSettingsJson($settingFile.FullName)

            if ($null -eq $setting -or $null -eq $setting.name) {
                Write-Host "ERROR: ignoring $($settingFile.FullName) because it is not a valid settings.json file "
                continue;
            }

            if ($null -ne $setting.galleries) {
                foreach ($gallery in $setting.galleries) {
                    $galleryName = "$($gallery.type)-$($gallery.resourceType)"

                    $existingGallery = $fullGallery.$($galleryName)
                    if ($null -eq $existingGallery) {
                        $existingGallery = @{}
                        $fullGallery.($galleryName) = $existingGallery
                    }

                    # if the gallery entry has a category key, use that instead of the folder based category
                    $categoryKey = $gallery.categoryKey;
                    if ($null -eq $categoryKey) {
                        $categoryKey = $setting.category;
                    }

                    $categoryInfo = $allCategories.$($categoryKey);

                    $existingCategory = $existingGallery.$($categoryKey);
                    if ($null -eq $existingCategory) {
                        $existingCategory = @{};
                        $existingCategory.templates = @();
                        if ($null -ne $categoryInfo) {
                            $existingCategory.name = $categoryInfo.name
                            if (![string]::IsNullOrWhitespace($categoryInfo.description)) {
                                $existingCategory.description = $categoryInfo.description
                            }
                            $existingCategory.order = $categoryInfo.order
                        } else {
                            # shouldn't really be possible based on the work before here, but just in case
                            Write-Host "ERROR: $($categoryKey) from $($settingFile.FullName) is missing categoryResources.json metadata"
                            $existingCategory.name = $categoryKey
                        }
                        $existingGallery.$($categoryKey) = $existingCategory
                    }

                    $existingCategory.templates += CreateOrderedTemplate $setting $gallery.order
                }
            }

            # add the item to the full index
            $filename = $setting.filename
            $index.($setting.id) = $filename
            # copy the file to the package output
            $destination = "$reportTypePath\$filename"
            #Write-Host "copying $filename to $destination"

            # not generally possible, but could happen if people created folder a, filename b-c and folder a-b, filename c, as both would end up "a-b-c"
            if (Test-Path $destination) {
                 Write-Host "ERROR: duplicate file name $destination"
            }
            Copy-Item -Path $template.FullName -Destination $destination -Force
        }

        # split this single file up into one file per gallery
        foreach ($key in $fullGallery.Keys) {
            $value = $fullGallery.$($key)
            $key = $key.Replace("/", "-")
            $galleryFileName = "$reportTypePath\_gallery.$key.json"
            $value | ConvertTo-Json -depth 10 -Compress | Out-File -FilePath $galleryFileName -Force
        }

        # if you want to see the full gallery of everything, this would generate it
        if ($generateFullGalleryFile) {
            $galleryFileName = "$reportTypePath\_gallery.json"
            $fullGallery | ConvertTo-Json -depth 10 -Compress | Out-File -FilePath $galleryFileName -Force
        }

        # create an index that has every path mapped to a file name
        # this includes items NOT in galleries.  hypothetically this might not be necessary as the
        # client side code could generate the right filenames, but then you don't know if you got a 404 because
        # of missing files or inaccuate generation.  Whether the client uses it or not, the package has it!
        $indexFileName = "$reportTypePath\_index.json"
        $index | ConvertTo-Json -depth 2 -Compress | Out-File -FilePath $indexFileName -Force

        if ($generateFullCategoriesFile) {
            $categoryFileName = "$reportTypePath\_categories.json"
            $allCategories | ConvertTo-Json -depth 2 -Compress | Out-File -FilePath $categoryFileName -Force
        }

        Write-Host "... DONE building gallery: $reporttype "
    }
}

# ------------------------------
# for the language provided, make sure all the important files from the source path are accounted for in the language folder
# ------------------------------
Function SyncWithEnUs() {
    param(
        [string] $sourcePath,
        [string] $lang
        )


    # find all the important files: **/categoryResources.json, *.workbook, *.cohort, **/settings.json, and any svg images
    # in the source path, and make sure they exist in the specific language's path
    foreach ($reportType in $reportTypes) {
        $created = 0;
        $reportPath = Join-Path -Path $sourcePath -ChildPath $reportType
        $langPath = Join-Path -Path $sourcePath -ChildPath "scripts\$lang\$reporttype"
        Write-Host "INFO: Syncing $lang with en-us from '$reportPath' to '$langPath'"
        $files = Get-ChildItem $reportPath -Recurse -file -Include "categoryresources.json", "*.workbook", "*.cohort", "settings.json", "*.svg"
        if ($files.Count -eq 0) {
            throw "SyncWithEnUs didn't find any files to copy from '$reportPath' to '$langPath'"
        }
        foreach ($file in $files) {
            $fullpath = $file.FullName
            $scriptpath = $fullpath.Replace($reportPath, $langPath)
            if ($scriptpath -eq $fullpath) {
                throw "ERROR: $fullpath.Replace('$reportPath', '$langPath') replaced nothing!"
            }
            #if (![System.IO.File]::Exists($scriptpath)) {
            if ($false -eq (Test-Path -Path $scriptPath -PathType leaf)) {
                Write-Host "INFO: copying missing file $fullPath to $scriptpath"
                # use newitem force to create the full path structure if it doesn't exist
                if (!(Test-Path (Split-Path -Path $scriptpath))) {
                    New-Item -ItemType File -Path $scriptpath -Force
                }
                Copy-Item -Path $fullPath -Destination $scriptpath
                $created++
            } else {
                Write-Host "INFO: exists: '$scriptpath'";
            }
        }
        Write-Host "INFO: $lang - copied $created missing files of $($files.Count) for $reportType"
    }

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
# en-us gets done first so that the content is there to sync up with all the other languages
foreach ($lang in $supportedLanguages) {
    Write-Host ""
    Write-Host "Processing..."
    Write-Host "...Language: $lang"

    if ($lang -eq $defaultLanguage) {
        $repoName = $repoBaseName
        $currentPath = $mainPath
    } else {
        $repoName = "$repoBaseName.$lang"
        $currentPath = Convert-Path "$localizeRoot\$lang"
        SyncWithEnUs $mainPath $lang
    }
    Set-Location -Path $currentPath
    $jsonFileName = "$azureBlobFileNameBase.$lang.json"

    Write-Host "...Repo: $repoName"
    Write-Host "...Directory: $currentPath"
    Write-Host "...OutputFile: $jsonFileName"

    # OLD-WAY for ALM Service: build the old template content
    # BuildingTemplateJson $jsonFileName $lang $outputPath

    # NEW-WAY make content for npm package
    CreatePackageContent $lang $outputPath
}

# restore default path
Pop-Location

# OLD-WAY for ALM Service: duplicate json for en-us to be compatible with existing process
Copy-Item -Path $outputPath\$azureBlobFileNameBase.$defaultLanguage.json -Destination $outputPath\$azureBlobFileNameBase.json

# NEW-WAY: copy package.json into the output/package directory
Copy-Item -Path $mainPath\package.json -Destination $outputPath\package

Write-Host "Done copying artifacts Existing"

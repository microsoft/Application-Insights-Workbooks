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

# - if "dev" is set on the command line, only build the en-us version of the package (fastest for testing)
if ($args[0] -eq "dev") {
    Write-Host "Building ONLY the dev template package, ONLY for en-us"
    $supportedLanguages = @( $defaultLanguage )
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
# SECTION - methods for creating package content.
#----------------------------------------------------------------------------

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
    param([string] $filepath, 
    [string] $reportType)
    $templateSettings = Get-Content $filepath -Encoding UTF8 | Out-String | ConvertFrom-Json 

    # Build path of file, working "up" the path until getting to the $reportType folder
    
    $templateFolderPath = Split-Path $filepath -Parent
    $templateFolderName = Split-Path $templateFolderPath -Leaf
    $templateCategoryFolderPath = Split-Path $templateFolderPath
    $templateCategory = Split-Path $templateCategoryFolderPath -Leaf
    $templateCategoryName = $templateCategory # the FIRST folder path found is the category name
    $templateReportTypePath = Split-Path $templateCategoryFolderPath
    $templateReportType = Split-Path $templateReportTypePath -Leaf
    # if there were nested folders, keep working up the hierarchy, prepending folders to template category
    while ($templateReportType -ne $reportType) {
        if ([string]::IsNullOrWhitespace($templateReportType)) {
            # this was somehow in a folder that was NOT inside the report type folder?
            throw "LoadSettingsJson had file '$filePath' not inside '$reportType' folder?"
        }
        $templateFolderName = "$templateCategory/$templateFolderName"
        $templateFolderPath = Split-Path $templateFolderPath -Parent
        $templateCategoryFolderPath = Split-Path $templateFolderPath
        $templateCategory = Split-Path $templateCategoryFolderPath -Leaf
        $templateReportTypePath = Split-Path $templateCategoryFolderPath
        $templateReportType = Split-Path $templateReportTypePath -Leaf
    }

    # path here should really be called "id" as it is the id of the template
    # at some point, we'll need to support aliases or moving of templates so we need to
    # split the id from the filename
    $templateMetadata = @{}
    $templateMetadata.category = $templateCategoryName
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

Function GetArmTemplateEncodedFileName() {
    param([string] $filepath, 
    [string] $reportType)

    $name = Split-Path $filepath -Leaf;

    $templateFolderPath = Split-Path $filepath -Parent
    $templateFolderName = Split-Path $templateFolderPath -Leaf
    $templateCategoryFolderPath = Split-Path $templateFolderPath
    $templateCategory = Split-Path $templateCategoryFolderPath -Leaf
    $templateCategoryName = $templateCategory # the FIRST folder path found is the category name
    $templateReportTypePath = Split-Path $templateCategoryFolderPath
    $templateReportType = Split-Path $templateReportTypePath -Leaf
    # if there were nested folders, keep working up the hierarchy, prepending folders to template category
    while ($templateReportType -ne $reportType) {
        if ([string]::IsNullOrWhitespace($templateReportType)) {
            # this was somehow in a folder that was NOT inside the report type folder?
            throw "GetArmTemplateEncodedFileName had file '$filePath' not inside '$reportType' folder?"
        }
        $templateFolderName = "$templateCategory/$templateFolderName"
        $templateFolderPath = Split-Path $templateFolderPath -Parent
        $templateCategoryFolderPath = Split-Path $templateFolderPath
        $templateCategory = Split-Path $templateCategoryFolderPath -Leaf
        $templateReportTypePath = Split-Path $templateCategoryFolderPath
        $templateReportType = Split-Path $templateReportTypePath -Leaf
    }    
    # for now, all of the template in the package are just .json to simplify deployment and not need special rules for .cohort, .workbook on web services for content type
    # and replace any / in filenames with - to avoid any filesystem issues
    return "$templateCategory-$templateFolderName-$name.json".Replace("/", "-")
}

#----------------------------------------------------------------------------
# add a given template (settings file) to a given gallery inside a specified category
#----------------------------------------------------------------------------
Function AddTemplateToCategory() {
    param(
        [object] $gallery,
        [string] $categoryKey,
        [object] $categoryInfo,
        [object] $settingFile,
        [object] $setting,
        [int] $order
    )

    $existingCategory = $gallery.$($categoryKey);
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
            Write-Host "ERROR: $($categoryKey) from $($settingFile.FullName) is missing $categoryMetadataFileName metadata"
            $existingCategory.name = $categoryKey
        }
        $gallery.$($categoryKey) = $existingCategory
    }

    $existingCategory.templates += CreateOrderedTemplate $setting $order
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

        $categories = Get-ChildItem "$currentPath\$reporttype" -Recurse -file -Include $categoryMetadataFileName
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

            $setting = LoadSettingsJson $settingFile.FullName $reporttype

            if ($null -eq $setting -or $null -eq $setting.name) {
                Write-Host "ERROR: ignoring $($settingFile.FullName) because it is not a valid settings.json file "
                continue;
            }

            if ($reporttype -eq "Cohorts") {
                # cohorts don't have "gallery" entries, they're all in the same category based gallery
                $galleryName = "$($reportType)-microsoft.insights/components"
                $existingGallery = $fullGallery.$($galleryName)
                if ($null -eq $existingGallery) {
                    $existingGallery = @{}
                    $fullGallery.($galleryName) = $existingGallery
                }

                $categoryKey = $setting.category
                $categoryInfo = $allCategories.$($categoryKey)

                AddTemplateToCategory $existingGallery $categoryKey $categoryInfo $settingFile $setting $gallery.order
            } elseif ($null -ne $setting.galleries) {
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

                    AddTemplateToCategory $existingGallery $categoryKey $categoryInfo $settingFile $setting $gallery.order
                }
            }

            # add the item to the full index
            $filename = $setting.filename

            # not currently blocking - local builds don't actually have an issue here but something on the build machine
            # is truncating files?
            if ($filename.length -gt 99) {
                 Write-Host "ERROR: file name exceeds 99ch limit $filename ($($filename.length))"
            }

            $index.($setting.id) = $filename
            # copy the file to the package output
            $destination = "$reportTypePath\$filename"
            #Write-Host "copying $filename to $destination"

            # not generally possible, but could happen if people created folder a, filename b-c and folder a-b, filename c, as both would end up "a-b-c"
            if (Test-Path $destination) {
                # Write-Host "ERROR: duplicate file name $destination"
            }
            Copy-Item -Path $template.FullName -Destination $destination -Force

            # also process any arm templates in this folder
            $armTemplates = Get-ChildItem $folder -Recurse -file -Include "*.armtemplate"
            foreach ($templateFile in $armTemplates) {
                $encodedName = GetArmTemplateEncodedFileName $templateFile $reporttype

                # not currently blocking - local builds don't actually have an issue here but something on the build machine
                # is truncating files? but if long enough even powershell will choke on it
                if ($encodedName.length -gt 99) {
                    Write-Host "ERROR: file name exceeds 99ch limit $encodedName ($($encodedName.length))"
                }

                $armTemplateDestination = "$reportTypePath\$encodedName"
                Copy-Item -Path $templateFile.FullName -Destination $armTemplateDestination -Force
            }
        }

        # split this single file up into one file per gallery
        foreach ($key in $fullGallery.Keys) {
            $value = $fullGallery.$($key)
            $key = $key.Replace("/", "-")
            $galleryFileName = "$reportTypePath\_gallery.$key.json"
            $value | ConvertTo-Json -depth 10 -Compress | Out-File -Encoding "UTF8" -FilePath $galleryFileName -Force
        }

        # if you want to see the full gallery of everything, this would generate it
        if ($generateFullGalleryFile) {
            $galleryFileName = "$reportTypePath\_gallery.json"
            $fullGallery | ConvertTo-Json -depth 10 -Compress | Out-File -Encoding "UTF8" -FilePath $galleryFileName -Force
        }

        # create an index that has every path mapped to a file name
        # this includes items NOT in galleries.  hypothetically this might not be necessary as the
        # client side code could generate the right filenames, but then you don't know if you got a 404 because
        # of missing files or inaccuate generation.  Whether the client uses it or not, the package has it!
        $indexFileName = "$reportTypePath\_index.json"
        $index | ConvertTo-Json -depth 2 -Compress | Out-File -Encoding "UTF8" -FilePath $indexFileName -Force

        if ($generateFullCategoriesFile) {
            $categoryFileName = "$reportTypePath\_categories.json"
            $allCategories | ConvertTo-Json -depth 2 -Compress | Out-File -Encoding "UTF8" -FilePath $categoryFileName -Force
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
        $files = Get-ChildItem $reportPath -Recurse -file -Include $categoryMetadataFileName, "*.workbook", "*.cohort", "settings.json", "*.armtemplate", "*.svg"
        if ($files.Count -eq 0) {
            throw "SyncWithEnUs didn't find any files to copy from '$reportPath' to '$langPath'"
        }
        foreach ($file in $files) {
            $fullpath = $file.FullName
            $scriptpath = $fullpath.Replace($reportPath, $langPath)
            if ($scriptpath -eq $fullpath) {
                throw "ERROR: $fullpath.Replace('$reportPath', '$langPath') replaced nothing!"
            }

            if ($false -eq (Test-Path -Path $scriptPath -PathType leaf)) {
                Write-Host "INFO: copying missing file $fullPath to $scriptpath"
                # use newitem force to create the full path structure if it doesn't exist
                if (!(Test-Path (Split-Path -Path $scriptpath))) {
                    New-Item -ItemType File -Path $scriptpath -Force | Out-Null
                }
                Copy-Item -Path $fullPath -Destination $scriptpath
                $created++
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

    Write-Host "...Repo: $repoName"
    Write-Host "...Directory: $currentPath"


    # NEW-WAY make content for npm package
    CreatePackageContent $lang $outputPath
}

# restore default path
Pop-Location

# copy package.json into the output/package directory
Copy-Item -Path $mainPath\scripts\package.json -Destination $outputPath\package
Copy-Item -Path $mainPath\scripts\.npmrc -Destination $outputPath\package

Write-Host "Done building package"

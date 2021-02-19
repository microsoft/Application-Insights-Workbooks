const fs = require('fs');
const path = require('path');
const { exit } = require('process');

// For Workbook items that are arrays, these are the following field names that uniquely identify them
const ArrayLocIdentifier = {
    "items": "name",
    "parameters": "id",
    "labelSettings": "columnId",
    "links": "id"
};

const LocalizeableFileExt = [
    "workbook",
    "cohort"
];

const LocalizeableFileType = {
    CategoryResources: 1,
    Settings: 2,
    Template: 3
};

const CategoryResourcesFile = "categoryResources.json";
const SettingsFile = "settings.json";
const IndexFile = "_index.json";
const GalleryFilePrefix = "_gallery.";
const CohortsGalleryFileName = "_gallery.Cohorts-microsoft.insights-components";

const Encoding = 'utf8';
const RESJSONFileExtension = ".resjson";
const DefaultLang = "en-us";

const WorkbookTemplateFolder = "\\Workbooks\\";
const CohortsTemplateFolder = "\\Cohorts\\";
const PackageOutputFolder = "\\output\\package\\";
const LangOutputSpecifier = "{Lang}";

const LanguagesMap = {
    "cs": "cs-cz",
    "de": "de-de",
    "es": "es-es",
    "en": "en-us",
    "fr": "fr-fr",
    "hu": "hu-hu",
    "it": "it-it",
    "ja": "ja-jp",
    "ko": "ko-kr",
    "nl": "nl-nl",
    "pl": "pl-pl",
    "pt-BR": "pt-br",
    "pt-PT": "pt-pt",
    "ru": "ru-ru",
    "sv": "sv-se",
    "tr": "tr-tr",
    "zh-Hans": "zh-cn",
    "zh-Hant": "zh-tw"
};


// Flag to turn on or off console logs
const LogInfo = true;

/**
 * FUNCTIONS 
 */

/** Enure given path is valid */
function testPath(path) {
    logMessage("Processing template path: " + path);
    if (fs.existsSync(path)) {
        return true;
    } else {
        logError("Template path does not exist: " + path);
        return false;
    }
}

function getWorkbookDirectories(rootDirectory) {
    const workbooksSubDir = rootDirectory.concat(WorkbookTemplateFolder);
    return getDirectoriesRecursive(workbooksSubDir);
}

function getCohortDirectories(rootDirectory) {
    const cohortsSubDir = rootDirectory.concat(CohortsTemplateFolder);
    return getDirectoriesRecursive(cohortsSubDir);
}

function flatten(lists) {
    return lists.reduce((a, b) => a.concat(b), []);
}

function getLocalizeableFileDirectories(directoryPath) {
    const workbooksDirectories = getWorkbookDirectories(directoryPath);
    const cohortsDirectories = getCohortDirectories(directoryPath);
    return (workbooksDirectories || []).concat(cohortsDirectories);
}

function getDirectories(srcpath) {
    return fs.readdirSync(srcpath)
        .map(file => path.join(srcpath, file))
        .filter(path => fs.statSync(path).isDirectory());
}

function getDirectoriesRecursive(srcpath) {
    return [srcpath, ...flatten(getDirectories(srcpath).map(getDirectoriesRecursive))];
}

/** Validates file type as localizeable. Expected to be either workbook/cohort file or settings/categoryjson file. Returns null if file is not localizeable */
function getLocalizeableFileType(fileName) {
    if (fileName.localeCompare(CategoryResourcesFile) === 0) {
        return LocalizeableFileType.CategoryResources;
    } else if (fileName.localeCompare(SettingsFile) === 0) {
        return LocalizeableFileType.Settings;
    }
    var a = fileName.split(".");
    if (a.length === 1 || (a[0] === "" && a.length === 2)) {
        return null;
    }
    const extension = a.pop();
    if (extension && LocalizeableFileExt.includes(extension.toLowerCase())) {
        return LocalizeableFileType.Template;
    }
    return null;
}

function logMessage(message) {
    if (LogInfo) {
        console.log("INFO: ", message);
    }
}

function logError(message, shouldExit) {
    console.error("ERROR: ", message);
    if (shouldExit) {
        exit(1);
    }
}

function openFile(file) {
    try {
        logMessage("Processing workbook or file: " + file);
        const data = fs.readFileSync(file, Encoding);
        return data;
    } catch (err) {
        logError("Cannot open file: " + file + " Error: " + err, true);
    }
}

function writeJSONToFile(content, fullPath, exitOnFail) {
    const directory = getDirectoryFromPath(fullPath);
    try {
        if (!fs.existsSync(directory)) {
            fs.mkdirSync(directory, { recursive: true });
        }
        fs.writeFileSync(fullPath, content);
    } catch (e) {
        logError("Cannot write to file: " + fullPath + "Error : " + e, exitOnFail);
    }
}

function removeNonAplhaNumeric(str) {
    return str.replace(/[\W_]/g, "");
}

/** Returns the directory from full path */
function getDirectoryFromPath(path) {
    return path.substr(0, path.lastIndexOf("\\"));
}

function addGalleryEntry(settingsData, settingsName, gallery, categoryResourcesMap, templatePath, rootDirectory, language) {
    if (!gallery[language]) {
        gallery[language] = {};
    }
    const galleryMap = gallery[language];

    var removedIndex = templatePath.replace(rootDirectory, "");
    if (removedIndex.startsWith("\\")) {
        removedIndex = removedIndex.substring(1);
    }
    var workbookName = "";

    const split = removedIndex.split("\\");
    for (s = 1; s < split.length; s++) {
        if (workbookName === "") {
            workbookName = workbookName.concat(split[s]);
        } else {
            workbookName = workbookName.concat("-", split[s]);
        }
    }

    const indexEntry = workbookName.concat(".json");
    const indexKey = removedIndex.split("\\").join("/");

    const templateSplit = templatePath.split("\\");
    const key = templateSplit[templateSplit.length - 2];
    const isCohorts = templatePath.includes(CohortsTemplateFolder);
    var galleryKey = CohortsGalleryFileName;
    const galleries = isCohorts ? [settingsData] : settingsData.galleries || [];

    for (var g in galleries) {
        if (!isCohorts) {
            const galleryEntry = settingsData.galleries[g];
            galleryKey = GalleryFilePrefix.concat(galleryEntry.type, "-", galleryEntry.resourceType.split("/").join("-"));
        }

        if (!galleryMap[galleryKey]) {
            galleryMap[galleryKey] = {};
        }
        // add entry for gallery
        if (!galleryMap[galleryKey][key]) {
            galleryMap[galleryKey][key] = {};
        }
        if (!galleryMap[galleryKey][key].description || !galleryMap[galleryKey][key].name) {
            if (categoryResourcesMap[key][language]) {
                galleryMap[galleryKey][key].description = categoryResourcesMap[key][language].description;
                galleryMap[galleryKey][key].name = categoryResourcesMap[key][language].name;
                galleryMap[galleryKey][key].order = categoryResourcesMap[key][language].order;
            }
        }
        if (!galleryMap[galleryKey][key].templates) {
            galleryMap[galleryKey][key].templates = [];
        }

        galleryMap[galleryKey][key].templates.push({
            id: indexKey,
            fileName: indexEntry,
            order: isCohorts ? 0 : galleries[g].order,
            author: settingsData.author,
            name: settingsName || settingsData.name,
            isPreview: settingsData.isPreview ? true : undefined,
            tags: isCohorts ? [] : settingsData.tags || undefined
        });
    }
}

/** Extract category resource info to build gallery files */
function getCategoryResourcesInfo(object, categoryResourcesMap, templatePath) {
    const templateSplit = templatePath.split("\\");
    const key = templateSplit[templateSplit.length - 1];
    if (key && object && object[DefaultLang]) {
        const entry = object[DefaultLang];
        categoryResourcesMap[key] = {
            "en-us": {
                name: entry.name,
                description: entry.description,
                order: entry.order
            }
        }
    }
}

function getRootFolder(dir) {
    var root = "";
    if (dir.includes(CohortsTemplateFolder)) {
        root = dir.slice(0, dir.indexOf(CohortsTemplateFolder));
    } else {
        root = dir.slice(0, dir.indexOf(WorkbookTemplateFolder));
    }
    return root;
}


function getFileType(fileName) {
    if (fileName.localeCompare(CategoryResourcesFile) === 0) {
        return LocalizeableFileType.CategoryResources;
    } else if (fileName.localeCompare(SettingsFile) === 0) {
        return LocalizeableFileType.Settings;
    }
    return LocalizeableFileType.Template;
}

/** Processes category resource file */
function processCategoryResourceFile(fileData, templatePath, rootDirectory) {
    try {
        const data = JSON.parse(fileData);
        getCategoryResourcesInfo(data, categoryResourcesData, templatePath);
        return getPackageOutputPath(templatePath, rootDirectory);
    } catch (e) {
        logError("Failed to process categoryResources file: " + templatePath + "Error: " + e, true);
    }
}

function processSettingsFile(settingsParsedData, galleryMap, categoryResourcesData, templatePath, rootDirectory) {
    try {
        addGalleryEntry(settingsParsedData, null, galleryMap, categoryResourcesData, templatePath, rootDirectory, DefaultLang);
    } catch (e) {
        logError("Failed to process settings file: " + templatePath + "Error: " + e, true);
    }
}

function processTemplateFile(cohortIndexEntries, workbookIndexEntries, templatePath, rootDirectory) {
    try {
        return getPackageOutputPath(templatePath, rootDirectory, cohortIndexEntries, workbookIndexEntries);
    } catch (e) {
        logError("Failed to process template file: " + templatePath + "Error: " + e, true);
    }
}

function parseCategoryResourcesStrings(fileData, categoryResourcesData, galleryMap, templatePath, lang) {
    const jsonData = JSON.parse(fileData);
    const templateSplit = templatePath.split("\\");
    const key = templateSplit[templateSplit.length - 1];
    const categoryResourcesMap = categoryResourcesData[key];
    // strings 
    var locStringData = {};

    // Extract strings from JSON file to map to
    for (const [itemId, translatedText] of Object.entries(jsonData)) {
        locStringData[itemId] = translatedText;
    }

    if (!categoryResourcesMap[lang]) {
        categoryResourcesMap[lang] = {};
    }

    const categoryResourcesLoc = categoryResourcesMap[lang];
    const keys = Object.keys(locStringData);
    keys.forEach(key => {
        if (key === "en-us.name") {
            categoryResourcesLoc["name"] = locStringData[key];
        } else if (key === "en-us.description") {
            categoryResourcesLoc["description"] = locStringData[key];
        }
        categoryResourcesLoc["order"] = categoryResourcesMap[DefaultLang].order;
    });

}

function parseTemplateResult(jsonData, lang, workbookJSON, settingsJSON, templatePath, fullpath, rootdirectory, categoryResourcesMap, galleryMap) {
    const locStringData = JSON.parse(jsonData);

    // Strings extracted. Replace results into workbook JSON
    const translatedJSON = replaceText(workbookJSON, settingsJSON, locStringData, templatePath, rootdirectory, categoryResourcesMap, lang, galleryMap);
    writeTranslatedWorkbookToFile(translatedJSON, fullpath);
}

/** Write file as new workbook  */
function writeTranslatedWorkbookToFile(data, fullPath) {
    const fileName = fullPath.split('\\').pop().split('/').pop();
    if (fileName.length > 99) {
        // not currently blocking - local builds don't actually have an issue here but something on the build machine is truncating files?
        logMessage("ERROR: File name exceeds 99ch limit " + fileName);
    }

    const content = JSON.stringify(data, null, "\t");
    writeJSONToFile(content, fullPath, true);
    logMessage("Generated translated file: " + fullPath);
}

/** Replace the strings in the workbook json */
function replaceText(workbookTemplate, settingsJSON, stringMap, templatePath, rootDirectory, categoryResourcesMap, lang, galleryMap) {
    var workbookJSON = JSON.parse(JSON.stringify(workbookTemplate));
    const keys = Object.keys(stringMap);
    addGalleryEntry(settingsJSON, stringMap["settings.name"], galleryMap, categoryResourcesMap, templatePath, rootDirectory, lang);
    keys.forEach(key => {
        if (key !== "settings.name") {
            const keyArray = convertStringKeyToPath(key);
            // value in the template
            const result = getValueFromPath(keyArray, workbookJSON);
            const templateVal = result && result.out; // value in the English template
            const actualKeyPath = result && result.paths; // the actual paths of the string (not using identifiers) 
            const translatedVal = stringMap[key]; // translated value in the resjson file

            if (templateVal && translatedVal && typeof templateVal == "string") {
                // change the template value
                var source = {};
                assignValueToPath(source, actualKeyPath, translatedVal);
                ObjectAssign(Object.create(workbookJSON), source);
            }
        }
    });
    return workbookJSON;
};

function convertStringKeyToPath(key) {
    return key.split(".");
}

function isNumeric(n) {
    return !isNaN(parseFloat(n)) && isFinite(n);
}

function getValueFromPath(paths, obj) {
    const keyPaths = [];
    for (var i = 0; i < paths.length; i++) {
        var currentKey = paths[i];
        if (Array.isArray(obj) && !isNumeric(currentKey)) { // If a key is not a number but comes after an array, check if its a unique identifer
            const previousKey = i > 0 ? paths[i - 1] : "";
            var index;

            if (Object.keys(ArrayLocIdentifier).includes(previousKey)) {
                index = obj.findIndex(o => {
                    const id = o[ArrayLocIdentifier[previousKey]];
                    if (id) {
                        const alphaNumericId = removeNonAplhaNumeric(id);
                        const compare = alphaNumericId.localeCompare(currentKey);
                        return compare === 0;
                    } else {
                        return false;
                    }
                });
                if (index !== -1) {
                    currentKey = index.toString();
                }
            }
        }
        if (obj[currentKey]) {
            obj = obj[currentKey];
            keyPaths.push(currentKey);
        } else {
            // value does not exist, template may have been updated
            return { out: null, paths: [] };
        }
    }
    return { out: obj, paths: keyPaths };
}

function assignValueToPath(obj, path, value) {
    var emptyObj = {};
    assignValueToObject(emptyObj, path, value);
    Object.assign(obj, emptyObj);
}

function ObjectAssign(target, ...sources) {
    sources.forEach(source => {
        Object.keys(source).forEach(key => {
            const sourceVal = source[key];
            const targetVal = target[key];
            target[key] = targetVal && sourceVal && typeof targetVal === 'object' && typeof sourceVal === 'object'
                ? ObjectAssign(targetVal, sourceVal)
                : sourceVal
        });
    });
    return target;
}

function assignValueToObject(obj, keys, value) {
    obj = typeof obj === 'object' ? obj : {};
    var curStep = obj;
    for (var i = 0; i < keys.length - 1; i++) {
        var key = keys[i];

        if (!curStep[key] && !Object.prototype.hasOwnProperty.call(curStep, key)) {
            var nextKey = keys[i + 1];
            var useArray = /^\+?(0|[1-9]\d*)$/.test(nextKey);
            curStep[key] = useArray ? [] : {};
        }
        curStep = curStep[key];
    }
    var finalStep = keys[keys.length - 1];
    curStep[finalStep] = value;
};

/** Returns matching localized file location */
function getClonedLocFilePath(templatePath, rootDirectory) {
    var result = rootDirectory;
    if (rootDirectory.endsWith("\\")) {
        result = result.substring(0, result.length - 1);
    }
    result = result.concat("\\out\\loc\\", LangOutputSpecifier, "\\output\\loc")
    var removedIndex = templatePath.replace(rootDirectory, "");
    if (removedIndex.startsWith("\\")) {
        removedIndex = removedIndex.substring(1);
    }

    if (removedIndex.startsWith("Workbooks")) {
        removedIndex = removedIndex.replace("Workbooks", "");
    } else if (removedIndex.startsWith("Cohorts")) {
        removedIndex = removedIndex.replace("Cohorts", "");
    }
    return result.concat(removedIndex, RESJSONFileExtension);
}

/** Returns the path of where the translated template should be dropped */
function getPackageOutputPath(templatePath, rootDirectory, cohortsIndexMap, workbooksIndexMap) {
    var result = rootDirectory;
    if (result.endsWith("\\")) {
        result = result.substring(0, result.length - 1);
    }
    result = result.concat(PackageOutputFolder, LangOutputSpecifier);
    var removedIndex = templatePath.replace(rootDirectory, "");
    if (removedIndex.startsWith("\\")) {
        removedIndex = removedIndex.substring(1);
    }

    const split = removedIndex.split("\\");
    var workbookName = "";
    for (s = 0; s < split.length; s++) {
        if (s === 0) {
            result = result.concat("\\", split[s], "\\");
            continue;
        }
        if (workbookName === "") {
            workbookName = workbookName.concat(split[s]);
        } else {
            workbookName = workbookName.concat("-", split[s]);
        }
    }
    result = result.concat(workbookName, ".json");
    if (cohortsIndexMap || workbooksIndexMap) {
        const indexEntry = workbookName.concat(".json");
        const indexKey = removedIndex.split("\\").join("/");

        if (templatePath.includes(CohortsTemplateFolder)) {
            cohortsIndexMap[indexKey] = indexEntry;
        } else {
            workbooksIndexMap[indexKey] = indexEntry;
        }
    }
    return result;
}

function generateIndexFiles(indexData, outputPath) {
    const content = JSON.stringify(indexData);
    for (var lang in LanguagesMap) {
        const fullPath = outputPath.replace(LangOutputSpecifier, LanguagesMap[lang]);
        writeJSONToFile(content, fullPath, true);
        logMessage("Generated Gallery Index File: " + fullPath);
    }
}

function generateGalleryFiles(galleryMap, outputPath) {
    for (var lang in LanguagesMap) {
        const localizedGallery = galleryMap[lang];
        for (var g in localizedGallery) {
            const subdir = g === CohortsGalleryFileName ? CohortsTemplateFolder : WorkbookTemplateFolder;
            const galleryFilePath = outputPath.concat(LanguagesMap[lang], subdir, g.concat(".json"));
            const galleryJSON = JSON.stringify(localizedGallery[g]);
            writeJSONToFile(galleryJSON, galleryFilePath, true);
            logMessage("Generated Gallery File: " + galleryFilePath);
        }
    }
}

/**
 * ============================================================
 * SCRIPT MAIN
 * ============================================================
 */

if (!process.argv[2]) { // Root path of template repository
    logError("Workbook path not provided. Please provide the path to the workbook folder.", true);
}

const directoryPath = process.argv[2];
const exists = testPath(directoryPath); // Verify directory path
if (!exists) {
    logError("Given script argument directory does not exist", true);
}

// Valid args, start processing the files.
logMessage("Template generation script starting...");

var directories = getLocalizeableFileDirectories(directoryPath);

var cohortIndexEntries = {}; // Map for generating cohort index files
var workbookIndexEntries = {}; // Map for generating workbook index files
var galleryMap = { // Map for generating gallery files
    "en-us": {}
};
var categoryResourcesData = {};
var rootDirectory;

for (var d in directories) {
    const templatePath = directories[d];
    if (!rootDirectory) {
        rootDirectory = getRootFolder(templatePath);
    }

    const files = fs.readdirSync(templatePath);
    if (!files || files.length === 0) {
        continue;
    }

    var file;
    var templateParsedData;
    var settingsParsedData;

    // Location of translated RESJSON outputted by the localization build
    const translatedRESJSONPath = getClonedLocFilePath(templatePath, rootDirectory);

    // Path for for translated workbook in output package
    var packageOutputPath;

    for (var i in files) {
        const fileName = files[i];
        const fileType = getLocalizeableFileType(fileName);
        // If file type is not valid, skip
        if (!fileType) {
            continue;
        }

        if (fileType !== LocalizeableFileType.Settings) {
            file = fileName;
            packageOutputPath = getPackageOutputPath(templatePath, rootDirectory);
        }

        const filePath = templatePath.concat("\\", fileName);

        // Parse the template for localizeable strings
        const fileData = openFile(filePath);
        if (fileType === LocalizeableFileType.CategoryResources) {
            // Category Resources file
            packageOutputPath = processCategoryResourceFile(fileData, templatePath, rootDirectory);
        } else if (fileType === LocalizeableFileType.Settings) {
            // Settings file
            settingsParsedData = JSON.parse(fileData);
            processSettingsFile(settingsParsedData, galleryMap, categoryResourcesData, templatePath, rootDirectory);
        } else {
            // Workbook template file
            templateParsedData = JSON.parse(fileData);
            packageOutputPath = processTemplateFile(cohortIndexEntries, workbookIndexEntries, templatePath, rootDirectory);
        }
    };

    // Template Generation 
    if (!templatePath.endsWith("\\")) {
        const fileType = getFileType(file);

        if (fileType === LocalizeableFileType.CategoryResources) {
            // Add category resources strings to map
            for (var lang in LanguagesMap) {
                if (lang !== "en") {
                    // Location of translated resjson
                    const localizedFilePath = translatedRESJSONPath.replace(LangOutputSpecifier, lang);
                    if (fs.existsSync(localizedFilePath)) {
                        const jsonFileData = fs.readFileSync(localizedFilePath, Encoding);
                        parseCategoryResourcesStrings(jsonFileData, categoryResourcesData, galleryMap, templatePath, lang);
                    } else {
                        logMessage("Did not find localized file in: " + localizedFilePath);
                    }
                }
            }
        } else if (fileType === LocalizeableFileType.Template) {
            // Generate localized templates
            for (var lang in LanguagesMap) {
                // Location of translated resjson
                const localizedFilePath = translatedRESJSONPath.replace(LangOutputSpecifier, lang);
                // Location of package for translated workbook
                const translatedResultPath = packageOutputPath.replace(LangOutputSpecifier, LanguagesMap[lang]);

                if (LanguagesMap[lang] === DefaultLang) {
                    writeTranslatedWorkbookToFile(templateParsedData, translatedResultPath);
                } else {
                    if (fs.existsSync(localizedFilePath)) {
                        // Do workbook string replacement here
                        const jsonData = fs.readFileSync(localizedFilePath, Encoding);
                        parseTemplateResult(jsonData, lang, templateParsedData, settingsParsedData, templatePath, translatedResultPath, rootDirectory, categoryResourcesData, galleryMap);
                    } else {
                        // No loc file found, just push the workbook file as is in English
                        logMessage("Did not find localized file in: " + localizedFilePath);
                        writeTranslatedWorkbookToFile(templateParsedData, translatedResultPath);
                    }
                }
            }
        }
    }
}

const outputFolder = rootDirectory.concat(rootDirectory.startsWith("\\") ? PackageOutputFolder.substring(1) : PackageOutputFolder);

generateGalleryFiles(galleryMap, outputFolder);
generateIndexFiles(cohortIndexEntries, outputFolder.concat(LangOutputSpecifier, CohortsTemplateFolder, IndexFile));

// copy package.json into the output/package directory
fs.copyFile(rootDirectory.concat("\\scripts\\package.json"), outputFolder.concat("package.json"), (err) => {
    if (err) throw err;
});
// copy .npmrc into output/package directory
fs.copyFile(rootDirectory.concat("\\scripts\\.npmrc"), outputFolder.concat(".npmrc"), (err) => {
    if (err) throw err;
});


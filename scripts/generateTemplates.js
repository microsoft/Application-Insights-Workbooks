const fs = require('fs');
const path = require('path');
const { exit } = require('process');

// For Workbook items that are arrays, these are the following field names that uniquely identify them
const ArrayLocIdentifier = {
    "items": "name",
    "parameters": "id",
    "labelSettings": "columnId",
    "links": "id",
    "categories": "id", // for gallery
    "templates": "id" // for gallery
};

const LocalizeableFileExt = [
    "workbook",
    "cohort"
];

const WorkbookFileType = {
    Template: 1,
    ARMTemplate: 2,
    Gallery: 3
};

const IndexFile = "_index.json";
const GalleryFilePrefix = "_gallery.";

const Encoding = 'utf8';
const RESJSONFileExtension = ".resjson";
const DefaultLang = "en";

const WorkbookTemplateFolder = "\\Workbooks\\";
const CohortsTemplateFolder = "\\Cohorts\\";
const GalleryFolder = "\\gallery";
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
    "zh-Hant": "zh-tw",
    "id": "id-id"
};

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

function getGalleryDirectory(rootDirectory) {
    const gallerySubDir =  rootDirectory.concat(GalleryFolder);
    return getDirectoriesRecursive(gallerySubDir);
}

function flatten(lists) {
    return lists.reduce((a, b) => a.concat(b), []);
}

function getLocalizeableFileDirectories(directoryPath) {
    const workbooksDirectories = getWorkbookDirectories(directoryPath);
    const cohortsDirectories = getCohortDirectories(directoryPath);
    const galleryDirectory = getGalleryDirectory(directoryPath);
    return (workbooksDirectories || []).concat(...cohortsDirectories, galleryDirectory);
}

function getDirectories(srcpath) {
    return fs.readdirSync(srcpath)
        .map(file => path.join(srcpath, file))
        .filter(path => fs.statSync(path).isDirectory());
}

function getDirectoriesRecursive(srcpath) {
    return [srcpath, ...flatten(getDirectories(srcpath).map(getDirectoriesRecursive))];
}

/** Validates file type. Expected to be either workbook/cohort file, armtemplate, or gallery file. Returns null if file type is not supported */
function getWorkbookFileType(path, fileName) {
    if (path.indexOf("\\gallery") !== -1 && fileName.endsWith(".json")) {
        return WorkbookFileType.Gallery;
    }
    var a = fileName.split(".");
    if (a.length === 1 || (a[0] === "" && a.length === 2)) {
        return null;
    }
    const extension = a.pop();
    if (extension && LocalizeableFileExt.includes(extension.toLowerCase())) {
        return WorkbookFileType.Template;
    }
    if (extension && extension.toLowerCase() === "armtemplate") {
        return WorkbookFileType.ARMTemplate;
    }
    return null;
}

function logMessage(message) {
    console.log("INFO: ", message);
}

function logError(message, shouldExit) {
    console.error("ERROR: ", message);
    if (shouldExit) {
        exit(1);
    }
}

function openAndParseJSONFile(file) {
    try {
        logMessage("Processing workbook or file: " + file);
        const data = fs.readFileSync(file, Encoding);
        return JSON.parse(data);
    } catch (err) {
        logError("Cannot open and parse file: " + file + " Error: " + err, true);
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

function getRootFolder(dir) {
    var root = "";
    if (dir.includes(CohortsTemplateFolder)) {
        root = dir.slice(0, dir.indexOf(CohortsTemplateFolder));
    } else {
        root = dir.slice(0, dir.indexOf(WorkbookTemplateFolder));
    }
    return root;
}

function processTemplateFile(fileData, cohortIndexEntries, workbookIndexEntries, templatePath, rootDirectory, languages) {
    try {
        // Location of translated RESJSON outputted by the localization build
        const translatedRESJSONPath = getClonedLocFilePath(templatePath, rootDirectory, WorkbookFileType.Template);

        const packageOutputPath = getPackageOutputPath(templatePath, rootDirectory, cohortIndexEntries, workbookIndexEntries);
        if (!templatePath.endsWith("\\")) {
            // Generate localized templates
            languages.forEach(lang => {
                // Location of translated resjson
                const localizedFilePath = translatedRESJSONPath.replace(LangOutputSpecifier, lang);
                // Location of package for translated workbook
                const translatedResultPath = packageOutputPath.replace(LangOutputSpecifier, LanguagesMap[lang]);

                if (lang === DefaultLang) {
                    writeTranslatedFile(fileData, translatedResultPath);
                } else {
                    if (fs.existsSync(localizedFilePath)) {
                        // Do workbook string replacement here
                        const jsonData = fs.readFileSync(localizedFilePath, Encoding);
                        parseTemplateResult(jsonData, fileData, translatedResultPath);
                    } else {
                        // No loc file found, just push the workbook file as is in English
                        logMessage("Did not find localized file in: " + localizedFilePath);
                        writeTranslatedFile(fileData, translatedResultPath);
                    }
                }
            });
        }
    } catch (e) {
        logError("Failed to process template file: " + templatePath + "Error: " + e, true);
    }
}

function processARMTemplateFile(templatePath, rootDirectory, fileName, armTemplateData, languages) {
    try {
        var path = getPackageOutputPath(templatePath, rootDirectory);
        path = path.replace(".json", "");
        path = path.concat("-", fileName, ".json");
        languages.forEach(lang => {
            const translatedResultPath = path.replace(LangOutputSpecifier, LanguagesMap[lang]);
            writeTranslatedFile(armTemplateData, translatedResultPath);
        });
    } catch (e) {
        logError("Failed to process ARM template file: " + templatePath + "Error: " + e, true);
    }
}

function processGalleryFile(galleryPath, rootDirectory, fileName, galleryData) {
    try {
        // Assign file names
        if (galleryData && galleryData.categories) {
            galleryData.categories.forEach(category => {
                category.templates.forEach(template => {
                    const templateId = template.id;
                    const templatePath = rootDirectory.endsWith("\\") ? rootDirectory.concat("\\", templateId) : rootDirectory.concat(templateId);
                    assignFileName(templatePath, rootDirectory, template);
                });
            });
        }

        var path = getPackageOutputPath(galleryPath, rootDirectory);
        if (galleryPath.endsWith("cohorts")) {
            path = path.replace("gallery\\", "Cohorts\\");
        } else {
            path = path.replace("gallery\\", "Workbooks\\");
        }

        const p = path.substr(0, path.lastIndexOf('\\'));
        const subDir = path.split("\\").pop();
        const workbookType = subDir.substr(0, subDir.lastIndexOf('.'));
        path = p.concat("\\", GalleryFilePrefix, workbookType, "-", fileName);

        // Location of translated RESJSON outputted by the localization build
        const translatedRESJSONPath = getClonedLocFilePath(galleryPath, rootDirectory, WorkbookFileType.Gallery, fileName);
        // Generate localized templates
        languages.forEach(lang => {
            // Location of translated resjson
            const localizedFilePath = translatedRESJSONPath.replace(LangOutputSpecifier, lang);
            // Location of package for translated gallery file
            const translatedResultPath = path.replace(LangOutputSpecifier, LanguagesMap[lang]);
            if (lang === DefaultLang) {
                writeTranslatedFile(galleryData, translatedResultPath);
            } else {
                if (fs.existsSync(localizedFilePath)) {
                    // Do workbook string replacement here
                    const jsonData = fs.readFileSync(localizedFilePath, Encoding);
                    parseTemplateResult(jsonData, galleryData, translatedResultPath);
                } else {
                    // No loc file found, just push the workbook file as is in English
                    logMessage("Did not find localized file in: " + localizedFilePath);
                    writeTranslatedFile(galleryData, translatedResultPath);
                }
            }
        });
    } catch (e) {
        logError("Failed to process gallery file: " + galleryPath + "Error: " + e, true);
    }
}


function parseTemplateResult(jsonData, workbookJSON, fullpath) {
    const locStringData = JSON.parse(jsonData);

    // Strings extracted. Replace results into workbook JSON
    const translatedJSON = replaceText(workbookJSON, locStringData);
    writeTranslatedFile(translatedJSON, fullpath);
}

/** Write output file */
function writeTranslatedFile(data, fullPath) {
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
function replaceText(workbookTemplate, stringMap) {
    var workbookJSON = JSON.parse(JSON.stringify(workbookTemplate));
    const keys = Object.keys(stringMap);
    keys.forEach(key => {
        // keeping this here for now because the string files will still have this info
        if (key !== "settings.name" && key !== "settings.description") {
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
function getClonedLocFilePath(templatePath, rootDirectory, fileType, fileName) {
    var result = rootDirectory;
    if (rootDirectory.endsWith("\\")) {
        result = result.substring(0, result.length - 1);
    }
    result = result.concat("\\out\\loc\\", LangOutputSpecifier, "\\output\\loc")
    var removedIndex = templatePath.replace(rootDirectory, "");
    if (!result.endsWith("\\")) {
        result = result.concat("\\");
    }
    if (removedIndex.startsWith("\\")) {
        removedIndex = removedIndex.substring(1);
    }

    if (fileType === WorkbookFileType.Gallery) {
        if (removedIndex.endsWith("\\")) {
            removedIndex = removedIndex.concat(fileName.substring(0, fileName.lastIndexOf('.')));
        } else {
            removedIndex = removedIndex.concat("\\", fileName.substring(0, fileName.lastIndexOf('.')));
        }
    } else {
        if (removedIndex.startsWith("Workbooks\\")) {
            removedIndex = removedIndex.replace("Workbooks\\", "");
        } else if (removedIndex.startsWith("Cohorts\\")) {
            removedIndex = removedIndex.replace("Cohorts\\", "");
        }
    }
    return result.concat(removedIndex, RESJSONFileExtension);
}

/** Assign file name field to all templates, since it is not required for authors to specify this */
function assignFileName(templatePath, rootDirectory, templateData) {
    var removedIndex = templatePath.replace(rootDirectory, "");
    if (removedIndex.startsWith("\\")) {
        removedIndex = removedIndex.substring(1);
    }
    const split = removedIndex.split("/");
    var workbookName = "";
    for (s = 1; s < split.length; s++) {
        if (workbookName === "") {
            workbookName = workbookName.concat(split[s]);
        } else {
            workbookName = workbookName.concat("-", split[s]);
        }
    }
    templateData.fileName = workbookName.concat(".json");
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

function generateIndexFiles(indexData, outputPath, languages) {
    const content = JSON.stringify(indexData);
    languages.forEach(lang => {
        const fullPath = outputPath.replace(LangOutputSpecifier, LanguagesMap[lang]);
        writeJSONToFile(content, fullPath, true);
        logMessage("Generated Gallery Index File: " + fullPath);
    });
}

/**
 * ============================================================
 * SCRIPT MAIN
 * ============================================================
 */

const directoryPath = process.argv[2];
if (!directoryPath) { // Root path of template repository
    logError("Workbook path not provided. Please provide the path to the workbook folder.", true);
}
const generateEnUsOnly = process.argv[3] === "dev";

const exists = testPath(directoryPath); // Verify directory path
if (!exists) {
    logError("Given script argument directory does not exist", true);
}

// Valid args, start processing the files.
logMessage("Template package generation script starting...");

const directories = getLocalizeableFileDirectories(directoryPath);
// Languages to generate
const languages = generateEnUsOnly ? [DefaultLang] : Object.keys(LanguagesMap);

var cohortIndexEntries = {}; // Map for generating cohort index files
var workbookIndexEntries = {}; // Map for generating workbook index files
var rootDirectory;

directories.forEach(filePath => {
    if (!rootDirectory) {
        rootDirectory = getRootFolder(filePath);
    }

    const files = fs.readdirSync(filePath);
    if (!files || files.length === 0) {
        return;
    }

    files.forEach(fileName => {
        const fileType = getWorkbookFileType(filePath, fileName);
        // If file type is not valid, skip
        if (!fileType) {
            return;
        }
        const fullPath = filePath.concat("\\", fileName);

        // Parse the JSON file
        const fileData = openAndParseJSONFile(fullPath);

        switch (fileType) {
            case WorkbookFileType.ARMTemplate:
                processARMTemplateFile(filePath, rootDirectory, fileName, fileData, languages);
                break;
            case WorkbookFileType.Gallery:
                processGalleryFile(filePath, rootDirectory, fileName, fileData);
                break;
            default:
                processTemplateFile(fileData, cohortIndexEntries, workbookIndexEntries, filePath, rootDirectory, languages);
        }

    });
});

const outputFolder = rootDirectory.concat(rootDirectory.startsWith("\\") ? PackageOutputFolder.substring(1) : PackageOutputFolder);

generateIndexFiles(cohortIndexEntries, outputFolder.concat(LangOutputSpecifier, CohortsTemplateFolder, IndexFile), languages);
generateIndexFiles(workbookIndexEntries, outputFolder.concat(LangOutputSpecifier, WorkbookTemplateFolder, IndexFile), languages);

// copy package.json into the output/package directory
fs.copyFile(rootDirectory.concat("\\scripts\\package.json"), outputFolder.concat("package.json"), (err) => {
    if (err) throw err;
});
// copy .npmrc into output/package directory
fs.copyFile(rootDirectory.concat("\\scripts\\.npmrc"), outputFolder.concat(".npmrc"), (err) => {
    if (err) throw err;
});
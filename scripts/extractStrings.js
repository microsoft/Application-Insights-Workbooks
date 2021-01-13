const fs = require('fs');
const path = require('path');
const { exit } = require('process');
const xml2js = require('xml2js');

// Keys to localize. Add new keys here.
const LocKeys = [
  "json",
  "description",
  "label",
  "linkLabel",
  "preText",
  "postText",
  "title",
  "chartTitle",
  "defaultItemsText",
  "loadButtonText",
  "noDataMessage"
];

// For Workbook items that are arrays, these are the following field names that uniquely identify them
const ArrayLocIdentifier = {
  "items": "name",
  "parameters": "id",
  "labelSettings": "columnId",
  "links": "id"
}

const LocalizableFileTypes = [
  "workbook",
  "cohort"
];

const CategoryResourcesFile = "categoryResources.json";
const SettingsFile = "settings.json";
const LocProjectFileName = "LocProject.json";
const IndexFile = "_index.json";
const GalleryFilePrefix = "_gallery.";
const CohortsGalleryFileName = "_gallery.Cohorts-microsoft.insights-components";

const Encoding = 'utf8';
const ResJsonStringFileExtension = '.resjson';
const LCLStringFileExtension = ".resjson.lcl";
const EngKey = "en-us";

const WorkbookTemplateFolder = "\\Workbooks\\";
const CohortsTemplateFolder = "\\Cohorts\\";
const RESJSONOutputFolder = "\\output\\loc\\";
const LocalizationRepoFolder = "\\scripts\\localization\\";
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
  "pl-BR": "pl-br",
  "pt-PT": "pt-pt",
  "ru": "ru-ru",
  "sv": "sv-se",
  "tr": "tr-tr",
  "zh-Hans": "zh-cn",
  "zh-Hant": "zh-tw"
}

const ValidParameterNameRegex = "[_a-zA-Z\xA0-\uFFFF][_a-zA-Z0-9\xA0-\uFFFF]*";
const ValidSpecifierRegex = "[_a-zA-Z0-9\xA0-\uFFFF\\-\\$\\@\\.\\[\\]\\*\\?\\(\\)\\<\\>\\=\\,\\:]*";
const ParameterRegex = new RegExp("\{" + ValidParameterNameRegex + "(:" + ValidSpecifierRegex + ")?\}", "g");
const NotAllSpecialCharsRegex = new RegExp("[a-z]+", "i");

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

/** Generates a output path for the template path by replacing template directory with output directory */
function generateOutputPath(dir, folder) {
  var outputPath;
  if (dir.includes(CohortsTemplateFolder)) {
    outputPath = dir.replace(CohortsTemplateFolder, folder);
  } else {
    outputPath = dir.replace(WorkbookTemplateFolder, folder);
  }
  if (!fs.existsSync(outputPath)) {
    const directoryPath = outputPath.substr(0, outputPath.lastIndexOf("\\"));
    fs.mkdirSync(directoryPath, { recursive: true });
  }
  return outputPath;
}

/** Validates file type as localizeable. Expected to be either workbook/cohort file or settings/categoryjson file. Returns null if file is not localizeable */
function getLocalizeableFileType(filename) {
  if (filename.localeCompare(CategoryResourcesFile) === 0 || filename.localeCompare(SettingsFile) === 0) {
    return filename;
  }
  var a = filename.split(".");
  if (a.length === 1 || (a[0] === "" && a.length === 2)) {
    return null;
  }
  const extension = a.pop();
  if (extension && LocalizableFileTypes.includes(extension.toLowerCase())) {
    return extension;
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
    logError("Cannot open file: " + file + " Error: " + err);
  }
}

function getLocalizeableStrings(obj, key, outputMap) {
  for (var field in obj) {
    var objectEntry = obj[field];
    var jsonKey;
    if (typeof objectEntry === 'object') {
      // If the last field is a number, it is part of an array.
      // See if there's another identifier such that if a template order is edited, the string does not need to be re-localized
      if (!isNaN(parseInt(field))) {
        jsonKey = getKeyForArrayObject(key, objectEntry, field);
      } else {
        jsonKey = key.concat(".", field);
      }
      getLocalizeableStrings(objectEntry, jsonKey, outputMap);

    } else if (LocKeys.includes(field)) {
      jsonKey = key.concat(".", field).substring(1);
      const jsonVal = obj[field];
      if (canLocalize(jsonVal)) {
        if (outputMap[jsonKey] != null) {
          logError("Found duplicate key: " + jsonKey + " To fix this error, change the step name or id");
          // delete the key from being localized 
          outputMap[jsonKey] = undefined;
        } else {
          outputMap[jsonKey] = jsonVal;
        }
      }
      // Check for parameters that should be locked
      findAndGenerateLockedStringComment(jsonKey, objectEntry, outputMap);
    }
  }
}

/** Returns true if string has localizeable text  */
function canLocalize(text) {
  return text !== null && text !== "" && text.match(NotAllSpecialCharsRegex);
}

/** Gets unique key identifier for array object */
function getKeyForArrayObject(key, objectEntry, field) {
  const identifier = endsWithLocIdentifier(key);
  if (identifier !== "" && objectEntry[ArrayLocIdentifier[identifier]] != null) {
    // remove special characters from the identifier
    return key.concat(".", removeNonAplhaNumeric(objectEntry[ArrayLocIdentifier[identifier]]));
  }
  return key.concat(".", field);
}

function endsWithLocIdentifier(key) {
  const ids = Object.keys(ArrayLocIdentifier);
  for (var i in ids) {
    if (key.endsWith(ids[i])) {
      return ids[i];
    }
  }
  return null
}

/** Get localizeable strings from category resources file */
function getCategoryResourceStrings(object, outputMap) {
  if (object && object[EngKey]) {
    const name = object[EngKey].name;
    const description = object[EngKey].description;
    outputMap["en-us.name"] = name;
    if (description != "") {
      outputMap["en-us.description"] = description;
    }
  }
}

/** Get localizeable strings from settings file */
function getSettingStrings(object, outputMap) {
  if (object && object.hasOwnProperty("name")) {
    outputMap["settings.name"] = object.name;
  }
}

function removeNonAplhaNumeric(str) {
  return str.replace(/[\W_]/g, "");
}

/** Needed as entry in resjson file to keep parameter names from being translated */
function findAndGenerateLockedStringComment(jsonKey, stringToLoc, outputMap) {
  const params = findParameterNames(stringToLoc);
  const columns = findColumnNameReferences(stringToLoc);

  if (params || columns) {
    const commentKey = "_" + jsonKey + ".comment";
    const commentEntry = "{Locked=" + (params || []).join(",") + (params && columns ? "," : "") + (columns || []).join(",") + "}";
    outputMap[commentKey] = commentEntry;
  }
}

/** Copied from InsightsPortal to find parameters in strings.*/
function findParameterNames(text) {
  var params = null;
  try {
    params = text.match(ParameterRegex);
  } catch (e) {
    logError("Cannot extract parameter. Error: " + e);
  }
  return params;
}

function findColumnNameReferences(text) {
  const ValidColumnNameRegex = '\\[\"' + ".*?" + '\"\\]';
  var _columnRegex = new RegExp(ValidColumnNameRegex, "g");
  var columnRefs = null;
  try {
    columnRefs = text.match(_columnRegex);
  } catch (e) {
    logError("Cannot extract parameter. Error: " + e);
  }
  return columnRefs;
}

/** Generate LocProject entry for localization tool */
function generateLocProjectEntry(templatePath, resjsonOutputPath, rootDirectory) {
  // For explanations on what each field does, see doc here: https://aka.ms/cdpxloc
  return {
    "SourceFile": resjsonOutputPath.concat(ResJsonStringFileExtension),
    "LclFile": getLocOutputPath(templatePath, LCLStringFileExtension, rootDirectory),
    "CopyOption": "LangIDOnPath",
    "OutputPath": getLocOutputPath(templatePath, ResJsonStringFileExtension, rootDirectory)
  };
}

function addGalleryEntry(settingsData, gallery, categoryResourcesMap, templatePath) {
  const galleryMap = gallery[EngKey];
  const rootDirectory = getRootFolder(templatePath);
  var removedIndex = templatePath.replace(rootDirectory, "");
  var workbookName = "";

  const split = removedIndex.split("\\");
  for (s = 2; s < split.length; s++) {
    if (workbookName === "") {
      workbookName = workbookName.concat(split[s]);
    } else {
      workbookName = workbookName.concat("-", split[s]);
    }
  }

  const indexEntry = workbookName.concat(".json");
  const indexKey = removedIndex.substr(1).split("\\").join("/");

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
      if (categoryResourcesMap[key][EngKey]) {
        galleryMap[galleryKey][key].description = categoryResourcesMap[key][EngKey].description;
        galleryMap[galleryKey][key].name = categoryResourcesMap[key][EngKey].name;
        galleryMap[galleryKey][key].order = categoryResourcesMap[key][EngKey].order;
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
      name: settingsData.name,
      isPreview: settingsData.isPreview ? true : undefined,
      tags: isCohorts ? [] : undefined
    });
  }
}

function addLocalizedGalleryEntry(nameSettings, settingsData, path, gallery, categoryResourcesMap, templatePath, language) {
  const lang = language.toLowerCase();
  const rootDirectory = getRootFolder(path);
  var outputPath = getRootFolder(templatePath);
  if (templatePath.includes(CohortsTemplateFolder)) {
    outputPath = outputPath.concat(CohortsTemplateFolder);
  } else {
    outputPath = outputPath.concat(WorkbookTemplateFolder);
  }

  var removedIndex = templatePath.replace(rootDirectory, "");
  var workbookName = "";

  const split = removedIndex.split("\\");
  for (s = 2; s < split.length; s++) {
    if (workbookName === "") {
      workbookName = workbookName.concat(split[s]);
    } else {
      workbookName = workbookName.concat("-", split[s]);
    }
  }

  const templateSplit = path.split("\\");
  const key = templateSplit[templateSplit.length - 2];
  const isCohorts = templatePath.includes(CohortsTemplateFolder);
  const galleries = isCohorts ? [settingsData] : settingsData.galleries || [];

  for (var g in galleries) {
    const galleryEntry = galleries[g];
    const galleryKey = isCohorts ? CohortsGalleryFileName : GalleryFilePrefix.concat(galleryEntry.type, "-", galleryEntry.resourceType.split("/").join("-"));
    const galleryFilePath = outputPath.concat(galleryKey, ".json");
    try {
      var result = fs.readFileSync(galleryFilePath);
      var parsed = JSON.parse(result);
      if (parsed && parsed[key]) {
        var templateEntry = parsed[key];
        if (templateEntry.description && templateEntry.description !== "" && categoryResourcesMap && categoryResourcesMap[key]
          && categoryResourcesMap[key][lang] && categoryResourcesMap[key][lang].description) {
          if (templateEntry.description === categoryResourcesMap[key][lang].description[EngKey]) {
            templateEntry.description = categoryResourcesMap[key][lang].description.value;
          }
        }
        if (templateEntry.name && templateEntry.name !== "" && categoryResourcesMap && categoryResourcesMap[key] && categoryResourcesMap[key][lang] && categoryResourcesMap[key][lang].name) {
          if (templateEntry.name === categoryResourcesMap[key][lang].name[EngKey]) {
            templateEntry.name = categoryResourcesMap[key][lang].name.value;
          }
        }
        if (templateEntry.templates) {
          const templatePathSplit = templatePath.split("\\");
          const id = templatePathSplit[templatePathSplit.length - 1];
          var template = templateEntry.templates.find(x => x.fileName === id);
          if (template && template.name === nameSettings[EngKey]) {
            template.name = nameSettings.value;
          }
        }

        // replace category json info
        // go to templates and replace there too
        const content = JSON.stringify(parsed, null, "\t");
        fs.writeFileSync(galleryFilePath, content);
      }
    } catch (error) {
      logError(error);
    }
  }
}

function addCategoryResourcesEntry(object, categoryResourcesMap, templatePath) {
  const templateSplit = templatePath.split("\\");
  const key = templateSplit[templateSplit.length - 1];
  if (key && object && object[EngKey]) {
    const entry = object[EngKey];
    categoryResourcesMap[key] = {
      "en-us": {
        name: entry.name,
        description: entry.description,
        order: entry.order
      }
    }
  }
}

/** Return output path like root/{Lang}/{TemplateType}/templatePath*/
function getLocOutputPath(templatePath, extensionType, root) {
  const newTemplatePath = templatePath.replace(root, root.concat("\\", LangOutputSpecifier))
  const templateSplit = newTemplatePath.split("\\");
  templateSplit[templateSplit.length - 1] = templateSplit[templateSplit.length - 1].concat(extensionType);
  return templateSplit.join("\\");
}

/** Write string file as RESJSON */
function writeToFileRESJSON(data, outputPath) {
  const fullpath = outputPath.concat(ResJsonStringFileExtension);

  const content = JSON.stringify(data, null, "\t");
  if (content.localeCompare("{}") === 0) {
    logMessage("No strings found for: " + fullpath);
    return;
  }

  try {
    fs.writeFileSync(fullpath, content);
    logMessage("Wrote to file: " + fullpath);
  } catch (e) {
    logError("Cannot write to file: " + fullpath + " Error: " + e);
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

/** Write a LocProject.json file needed to point the loc tool to the resjson files + where to output LCL files  */
function generateLocProjectFile(locItems, directoryPath) {
  logMessage("Generating LocProject.json file");

  const locProjectJson = {
    "Projects": [
      {
        "LanguageSet": "Azure_Languages",
        "LocItems": locItems
      }
    ]
  };
  const content = JSON.stringify(locProjectJson, null, "\t");
  const pathToLocProjectFile = getRootFolder(directoryPath).concat("\\src");;
  try {
    if (!fs.existsSync(pathToLocProjectFile)) {
      fs.mkdirSync(pathToLocProjectFile, { recursive: true });
    }
    fs.writeFileSync(pathToLocProjectFile.concat("\\", LocProjectFileName), content);
    logMessage("Generated LocProject.json file: " + pathToLocProjectFile);
  } catch (e) {
    logError("Cannot write LocProject.json file: " + pathToLocProjectFile + " Error: " + e);
  }
}

/**
 * ===================== Template Generation ===========================
 */


async function generateTranslatedFile(fileData, workbookJSON, settingsJSON, templatePath, outputDir, fullPath, galleryMap, categoryResourcesMap) {
  const result = await xml2js.parseStringPromise(fileData /*, options */);
  parseXMLResult(result, workbookJSON, settingsJSON, templatePath, outputDir, fullPath, galleryMap, categoryResourcesMap);
}

async function extractLocalizedCategoryResources(fileData, categoryResourcesMap, templatePath) {
  const result = await xml2js.parseStringPromise(fileData /*, options */);
  parseCategoryResourcesStrings(result, categoryResourcesMap, templatePath);
}

function parseCategoryResourcesStrings(xmlData, categoryResourcesData, templatePath) {
  const templateSplit = templatePath.split("\\");
  const key = templateSplit[templateSplit.length - 1];
  const categoryResourcesMap = categoryResourcesData[key];
  // strings 
  const lang = (xmlData.LCX.$.TgtCul).toLowerCase();
  const strings = xmlData.LCX.Item[0].Item[0].Item
  var locStringData = {};
  // Extract strings from XML LCL file to map 
  strings.forEach(entry => {
    parseStringEntry(entry, locStringData);
  });

  if (!categoryResourcesMap[lang]) {
    categoryResourcesMap[lang] = {};
  }
  const categoryResourcesLoc = categoryResourcesMap[lang];
  const keys = Object.keys(locStringData);
  keys.forEach(key => {
    if (key === "en-us.name") {
      // TODO, check that it matches english
      categoryResourcesLoc["name"] = locStringData[key];
    } else if (key === "en-us.description") {
      categoryResourcesLoc["description"] = locStringData[key];
    }
    categoryResourcesLoc["order"] = categoryResourcesMap[EngKey].order;
  });

}

function parseXMLResult(result, workbookJSON, settingsJSON, templatePath, outputDir, fullpath, galleryMap, categoryResourcesMap) {
  const lang = (result.LCX.$.TgtCul).toLowerCase(); // language specified in LCL file

  // strings 
  const strings = result.LCX.Item[0].Item[0].Item
  var locStringData = {};
  // Extract strings from XML LCL file to map 
  strings.forEach(entry => {
    parseStringEntry(entry, locStringData);
  });

  // Strings extracted. Replace results into workbook JSON
  const translatedJSON = replaceText(workbookJSON, settingsJSON, locStringData, templatePath, outputDir, fullpath, galleryMap, categoryResourcesMap, lang);
  writeTranslatedWorkbookToFile(translatedJSON, outputDir, fullpath);
}

/** Write file as new workbook  */
function writeTranslatedWorkbookToFile(data, templateDir, fullPath) {
  const content = JSON.stringify(data, null, "\t");
  try {
    if (!fs.existsSync(templateDir)) {
      fs.mkdirSync(templateDir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content);
    logMessage("Generated translated file: " + fullPath);
  } catch (e) {
    logError("Cannot write to file file: " + fullPath + "Error : " + e);
  }
}

function parseStringEntry(entry, locStringData) {
  // strings always start with ; so get rid of the first char
  var itemId = entry.$.ItemId.substring(1);
  locStringData[itemId] = {};
  const entryInput = entry.Item && entry.Item[0] || entry;
  const originalEngText = entryInput.Str[0].Val[0];
  locStringData[itemId][EngKey] = originalEngText;
  if (entryInput.Str[0].Tgt) { // some entries might not have a target yet
    const translatedText = entryInput.Str[0].Tgt[0].Val[0];
    locStringData[itemId]["value"] = translatedText;
  }
}

/** Replace the strings in the workbook json */
function replaceText(workbookTemplate, settingsJSON, stringMap, templatePath, outputDir, fullPath, galleryMap, categoryResourcesMap, lang) {
  var workbookJSON = JSON.parse(JSON.stringify(workbookTemplate));
  const keys = Object.keys(stringMap);
  keys.forEach(key => {
    if (key === "settings.name") {
      addLocalizedGalleryEntry(stringMap[key], settingsJSON, templatePath, galleryMap, categoryResourcesMap, fullPath, lang);
    } else {
      const keyArray = convertStringKeyToPath(key);
      // value in the template
      const result = getValueFromPath(keyArray, workbookJSON);
      const templateVal = result && result.out; // value in the english template
      const actualKeyPaths = result && result.paths; // the actual paths of the string (not using identifiers) 
      const translatedVal = stringMap[key]["value"]; // translated value in the lcl file
      const engVal = stringMap[key][EngKey]; // original english value in the lcl file

      if (templateVal && translatedVal && templateVal.localeCompare(engVal) === 0) { // if the text from the lcl file and template file match, we can go ahead and replace it
        // change the template value
        var source = {};
        assignValueToPath(source, actualKeyPaths, translatedVal);
        ObjectAssign(Object.create(workbookJSON), source);
      }
    }
  });
  return workbookJSON;
};

function convertStringKeyToPath(key) {
  return key.split(".");
}

function getValueFromPath(paths, obj) {
  const keyPaths = [];
  for (var i = 0; i < paths.length; i++) {
    var currentKey = paths[i];
    if (Array.isArray(obj) && isNaN(parseInt(currentKey))) { // If a key is not a number but comes after an array, check if its a unique identifer
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
  var result = rootDirectory.concat(LocalizationRepoFolder, LangOutputSpecifier);
  var removedIndex = templatePath.replace(rootDirectory, "");
  return result.concat(removedIndex, LCLStringFileExtension);
}

/** Returns the path of the translated template */
function getPackageOutputPath(templatePath, cohortsIndexMap, workbooksIndexMap) {
  const rootDirectory = getRootFolder(templatePath);
  var result = rootDirectory.concat(PackageOutputFolder, LangOutputSpecifier);
  var removedIndex = templatePath.replace(rootDirectory, "");

  const split = removedIndex.split("\\");
  var workbookName = "";
  for (s = 1; s < split.length; s++) {
    if (s === 1) {
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
    const indexKey = removedIndex.substr(1).split("\\").join("/");

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
    const directory = fullPath.substr(0, fullPath.lastIndexOf("\\"));
    try {
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
      fs.writeFileSync(fullPath, content);
      logMessage("Generated Gallery Index File: " + fullPath);
    } catch (e) {
      logError("Cannot write to file: " + fullPath + "Error: " + e);
    }
  }
}

function generateGalleryFiles(galleryMap, outputPath) {
  const engGallery = galleryMap[EngKey];
  for (var g in engGallery) {
    const galleryName = g.concat(".json");
    for (var lang in LanguagesMap) {
      const language = LanguagesMap[lang];
      var subdir = WorkbookTemplateFolder;
      if (g === CohortsGalleryFileName) {
        subdir = CohortsTemplateFolder;
      }
      const galleryFilePath = outputPath.concat(language, subdir, galleryName);
      const galleryJSON = JSON.stringify(engGallery[g]);
      try {
        const directory = galleryFilePath.substr(0, galleryFilePath.lastIndexOf("\\"));
        if (!fs.existsSync(directory)) {
          fs.mkdirSync(directory, { recursive: true });
        }
        if (!fs.existsSync(galleryFilePath)) {
          fs.writeFileSync(galleryFilePath, galleryJSON);
        }
        logMessage("Generated Gallery File: " + galleryFilePath);
      } catch (e) {
        logError("Cannot write to file: " + galleryFilePath + "Error: " + e);
      }
    }
  }
}

/**
 * ============================================================
 * SCRIPT MAIN
 * ============================================================
 */

if (!process.argv[2]) { // Path to extract strings from 
  logError("Workbook path not provided. Please provide the path to the workbook folder.", true);
}

if (!process.argv[3]) { // Flag to specify root or test directory
  logError("Please specify if the given directory is root or test. 'root' means the given path is the root directory of the repository. 'test' means the given path is a subdirectory eg. workbook folder with template.", true);
}

const directoryPath = process.argv[2];
const exists = testPath(directoryPath); // Verify directory path
if (!exists) {
  logError("Given script argument directory does not exist", true);
}

// Valid args, start processing the files.
console.log(">>>>> Localization script starting...");

var directories = process.argv[3] === "test" ? [directoryPath] : getLocalizeableFileDirectories(directoryPath);


const locProjectOutput = []; // List of localization file entries for LocProject.json output
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

  // This is where we will output the resjson artifact
  const resjonOutputPath = generateOutputPath(templatePath, RESJSONOutputFolder);
  var extracted = {};
  var file;
  var jsonParsedData;
  var settingsParsedData;

  // location of translated resjson
  const locFilePath = getClonedLocFilePath(templatePath, rootDirectory);
  // location of package for translated workbook
  var translatedPath;

  for (var i in files) {
    const fileName = files[i];
    // Get the contents of the workbook
    const extensionType = getLocalizeableFileType(fileName);
    // If extension type is not valid localizeable file type, skip
    if (!extensionType) {
      continue;
    }

    const filePath = templatePath.concat("\\", fileName);
    const fileData = openFile(filePath);
    // Parse the template for localizeable strings
    try {
      if (extensionType.localeCompare(CategoryResourcesFile) === 0) {
        const categoryResourceData = JSON.parse(fileData);
        // Special case for category resource strings
        getCategoryResourceStrings(categoryResourceData, extracted);
        file = fileName;
        addCategoryResourcesEntry(categoryResourceData, categoryResourcesData, templatePath);
        translatedPath = getPackageOutputPath(templatePath);
        generatedTemplatePath = translatedPath.substr(0, translatedPath.lastIndexOf("\\"));
      } else if (extensionType.localeCompare(SettingsFile) === 0) {
        settingsParsedData = JSON.parse(fileData);
        getSettingStrings(settingsParsedData, extracted);
        addGalleryEntry(settingsParsedData, galleryMap, categoryResourcesData, templatePath);
      } else {
        getLocalizeableStrings(jsonParsedData, '', extracted);
        file = fileName;
        jsonParsedData = JSON.parse(fileData);
        translatedPath = getPackageOutputPath(templatePath, cohortIndexEntries, workbookIndexEntries);
        generatedTemplatePath = translatedPath.substr(0, translatedPath.lastIndexOf("\\"));
      }
    } catch (error) {
      logError("Cannot extract JSON: " + filePath + "Error: " + error);
      // TODO: just write everything to file
      continue;
    }
  };

  if (Object.keys(extracted).length > 0 && !templatePath.endsWith("\\")) {
    // Add LocProject entry
    const locProjectEntry = generateLocProjectEntry(templatePath, resjonOutputPath, rootDirectory);
    locProjectOutput.push(locProjectEntry);

    // Write extracted strings to file
    writeToFileRESJSON(extracted, resjonOutputPath);
    if (file.localeCompare(CategoryResourcesFile) === 0) {
      // add category resources strings to map
      for (var lang in LanguagesMap) {
        // location of translated resjson
        const localizedFilePath = locFilePath.replace(LangOutputSpecifier, lang);
        // location of package for translated workbook
        const translatedResultPath = translatedPath.replace(LangOutputSpecifier, LanguagesMap[lang]);
        if (fs.existsSync(localizedFilePath)) {
          const xmlData = fs.readFileSync(localizedFilePath, Encoding);
          extractLocalizedCategoryResources(xmlData, categoryResourcesData, templatePath);
        }
      }
    }

    if (file.localeCompare(CategoryResourcesFile) !== 0 && file.localeCompare(SettingsFile) !== 0) {
      // Generate localized templates
      for (var lang in LanguagesMap) {
        // location of translated resjson
        const localizedFilePath = locFilePath.replace(LangOutputSpecifier, lang);
        // location of package for translated workbook
        const translatedResultPath = translatedPath.replace(LangOutputSpecifier, LanguagesMap[lang]);
        const generatedTemplatePath = translatedResultPath.substr(0, translatedResultPath.lastIndexOf("\\"));

        if (lang === EngKey) {
          writeTranslatedWorkbookToFile(jsonParsedData, generatedTemplatePath, translatedResultPath);
        } else {
          if (fs.existsSync(localizedFilePath)) {
            // Do workbook string replacement here
            const xmlData = fs.readFileSync(localizedFilePath, Encoding);

            generateTranslatedFile(xmlData, jsonParsedData, settingsParsedData, templatePath, generatedTemplatePath, translatedResultPath, galleryMap, categoryResourcesData);
          } else {
            // No loc file found, just push the workbook file as is in English
            writeTranslatedWorkbookToFile(jsonParsedData, generatedTemplatePath, translatedResultPath);
          }
        }
      }
    }
  }
}

// Generate and push locProject file
if (locProjectOutput.length > 0) {
  generateLocProjectFile(locProjectOutput, directoryPath.concat("\\"));
}

generateGalleryFiles(galleryMap, rootDirectory.concat(PackageOutputFolder));

generateIndexFiles(cohortIndexEntries, rootDirectory.concat(PackageOutputFolder, LangOutputSpecifier, CohortsTemplateFolder, IndexFile));
generateIndexFiles(workbookIndexEntries, rootDirectory.concat(PackageOutputFolder, LangOutputSpecifier, WorkbookTemplateFolder, IndexFile));

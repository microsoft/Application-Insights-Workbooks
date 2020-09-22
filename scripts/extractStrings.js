const fs = require('fs'), path = require('path'), xml2js = require('xml2js');

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
const LocalizableFileTypes = [
  "workbook",
  "cohort"
];

const SettingsFileLocKeys = [
  "name",
  "description"
];

const CategoryResourcesFile = "categoryResources.json";
const SettingsFile = "settings.json";

const Encoding = 'utf8';
const ResJsonStringFileExtension = 'resjson';
const LCLStringFileExtension = "resjson.lcl";

const WorkbookTemplateFolder = "\\Workbooks\\";
const CohortsTemplateFolder = "\\Cohorts\\";

const RESJSONOutputFolder = "\\output\\loc\\";
const TemplateOutoutFolder = "\\output\\templates\\"

const LocProjectFileName = "LocProject.json";
const LangOutputSpecifier = "\\{Lang}\\";

const Languages = [
  "cs", "de", "es", "fr", "hu", "it", "ja", "ko", "nl", "pl", "pl-BR", "pt-PT", "ru", "sv", "tr", "zh-Hans", "zh-Hant"
];

/**
 * FUNCTIONS 
 */

/** Enure given path is valid */
function testPath(path) {
  console.log(">>>>> Processing template path: ", path);
  if (fs.existsSync(path)) {
    console.log("Path verified.");
    return true;
  } else {
    console.error("ERROR: Template path does not exist: ", path);
    return false;
  }
}

function flatten(lists) {
  return lists.reduce((a, b) => a.concat(b), []);
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
  if (dir.includes(CohortsTemplateFolder)) {
    return dir.replace(CohortsTemplateFolder, folder);
  } else {
    return dir.replace(WorkbookTemplateFolder, folder);
  }
}

/** Validates file type. Expected to be either workbook/cohort file or settings/categoryjson file */
function isValidFileType(filename) {
  if (filename.localeCompare(CategoryResourcesFile) === 0 || filename.localeCompare(SettingsFile) === 0) {
    return true;
  }
  var a = filename.split(".");
  if (a.length === 1 || (a[0] === "" && a.length === 2)) {
    return false;
  }
  const extension = a.pop();
  return extension && LocalizableFileTypes.includes(extension.toLowerCase());
}

function openFile(file) {
  try {
    console.log(">>>>> Processing workbook or file: ", file);
    const data = fs.readFileSync(file, Encoding);
    return data;
  } catch (err) {
    console.error("ERROR: Cannot open file: ", file, "ERROR: ", err);
  }
}

function getLocalizeableStrings(obj, key, outputMap, filename) {
  for (var i in obj) {
    if (!obj.hasOwnProperty(i)) {
      continue;
    }
    if (typeof obj[i] === 'object') {
      getLocalizeableStrings(obj[i], key.concat(i, '.'), outputMap, filename);
    } else if (filename.localeCompare(SettingsFile) === 0) {
      // Settings file has different loc keys than template files
      if (SettingsFileLocKeys.includes(i)) {
        const jsonKey = key.concat(i);
        outputMap[jsonKey] = obj[i];
      }
    } else if (LocKeys.includes(i)) {
      const jsonKey = key.concat(i);
      const jsonVal = obj[i];
      if (jsonVal !== "") {
        outputMap[jsonKey] = jsonVal;
      }

      // Check for parameters that should be locked
      findAndGenerateLockedStringComment(jsonKey, obj[i], outputMap);
    }
  }
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

/** Copied from InsightsPortal to find parameters in strings. TODO: need to handle column name references */
function findParameterNames(text) {
  const ValidParameterNameRegex = "[_a-zA-Z\xA0-\uFFFF][_a-zA-Z0-9\xA0-\uFFFF]*";
  const ValidSpecifierRegex = "[_a-zA-Z0-9\xA0-\uFFFF\\-\\$\\@\\.\\[\\]\\*\\?\\(\\)\\<\\>\\=\\,\\:]*";
  var _parameterRegex = new RegExp("\{" + ValidParameterNameRegex + "(:" + ValidSpecifierRegex + ")?\}", "g");
  var params = null;
  try {
    params = text.match(_parameterRegex);
  } catch (e) {
    console.error("ERROR: Cannot extract parameter. ", "ERROR: ", e);
  }

  return params;
}

function findColumnNameReferences(text) {
  const ValidColumnNameRegex = "\[\".+\"\]";
  var _columnRegex = new RegExp(ValidColumnNameRegex, "g");
  var columnRefs = null;
  try {
    columnRefs = text.match(_columnRegex);
  } catch (e) {
    console.error("ERROR: Cannot extract parameter. ", "ERROR: ", e);
  }
  return columnRefs;
}

function replaceFileExtension(fileName, extensionType) {
  var a = fileName.split(".");
  const extension = a.pop();
  return fileName.replace(extension, extensionType);
}

/** Write string file as RESJSON */
function writeToFileRESJSON(data, fileName, outputPath) {
  const resjsonFileName = replaceFileExtension(fileName, ResJsonStringFileExtension);
  const fullpath = outputPath.concat("\\", resjsonFileName);

  const content = JSON.stringify(data, null, "\t");
  if (content.localeCompare("{}") === 0) {
    console.log("No strings found for: ", fileName);
    return;
  }

  try {
    fs.writeFileSync(fullpath, content);
    console.log(">>>>> Wrote to file: ", fullpath);
  } catch (e) {
    console.error("ERROR: Cannot write to file: ", fullpath, "ERROR: ", e);
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
  console.log(">>>>> Generating LocProject.json file...");

  const locProjectJson = {
    "Projects": [
      {
        "LanguageSet": "Azure_Languages",
        "LocItems": locItems
      }
    ]
  };
  const content = JSON.stringify(locProjectJson, null, "\t");
  try {
    const pathToLocProjectFile = getRootFolder(directoryPath).concat("\\src");;
    if (!fs.existsSync(pathToLocProjectFile)) {
      fs.mkdirSync(pathToLocProjectFile, { recursive: true });
    }
    fs.writeFileSync(pathToLocProjectFile.concat("\\", LocProjectFileName), content);
    console.log(">>>>> Generated LocProject.json file: ", pathToLocProjectFile);
  } catch (e) {
    console.error("Cannot write LocProject.json file: ", pathToLocProjectFile, "ERROR: ", e);
  }
}

/**
 * ===================== Template Generation ===========================
 */


function generateTranslatedFile(fileData, workbookJSON, templateDir, fullpath) {
  xml2js.parseStringPromise(fileData /*, options */).then(function (result) {
      parseXMLResult(result, workbookJSON, templateDir, fullpath);
  }).catch(function (err) {
      // Failed
      console.error("ERROR: Could not parse XML file", err);
  });
}

function parseXMLResult(result, workbookJSON, templateDir, fullpath) {
  console.log(result);
  // language 
  const lang = result.LCX.$.TgtCul;
  console.log("Processing language: ", lang);

  // strings 
  const strings = result.LCX.Item[0].Item[0].Item
  console.log(strings);
  var locStringData = {};
  // Extract strings from XML LCL file to map 
  strings.forEach(entry => {
      parseStringEntry(entry, locStringData);
  });

  // Strings extracted. Replace results into workbook JSON
  const translatedJSON = replaceText(workbookJSON, locStringData);
  writeTranslatedWorkbookToFile(translatedJSON, templateDir, fullpath);
}

/** Write file as new workbook  */
function writeTranslatedWorkbookToFile(data, templateDir, fullpath) {
  const content = JSON.stringify(data, null, "\t");
  try {
      if (!fs.existsSync(templateDir)) {
          fs.mkdirSync(templateDir, { recursive: true });
      }
      fs.writeFileSync(fullpath, content);
      console.log(">>>>> Generated translated file: ", fullpath);
  } catch (e) {
      console.error("ERROR: Cannot write to file: ", fullpath, "ERROR: ", e);
  }
}

function parseStringEntry(entry, locStringData) {
  // strings always start with ; so get rid of the first char
  var itemId = entry.$.ItemId.substring(1);
  locStringData[itemId] = {};

  const originalEngText = entry.Str[0].Val[0];
  locStringData[itemId]["en-us"] = originalEngText;
  if (entry.Str[0].Tgt) { // some entries might not have a target yet
    const translatedText = entry.Str[0].Tgt[0].Val[0];
    locStringData[itemId]["value"] = translatedText;
  }
}

/** Replace the strings in the workbook json */
function replaceText(workbookJSON, stringMap) {
  const keys = Object.keys(stringMap);
  keys.forEach(key => {
      const keyArray = convertStringKeyToPath(key);
      // value in the template
      const templateVal = getValFromPath(keyArray, workbookJSON); // value in the english template
      const translatedVal = stringMap[key]["value"]; // translated value in the lcl file
      const engVal = stringMap[key]["en-us"]; // original english value in the lcl file

      if (translatedVal && templateVal.localeCompare(engVal) === 0) { // if the text from the lcl file and template file match, we can go ahead and replace it
          // change the template value
          var source = {};
          assignValueToPath(source, keyArray, translatedVal);
          ObjectAssign(Object.create(workbookJSON), source);
      }
  });
  return workbookJSON;
};

function convertStringKeyToPath(key) {
  const vals = key.split(".");
  return vals;
}

function getValFromPath(paths, obj) {
  var output = obj;
  paths.forEach(key => {
      output = output[key];
  });
  return output;
}

function assignValueToPath(obj, path, value) {
  var emptyObj = {};
  const val = assignValueToObject(emptyObj, path, value);
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

function getClonedLocDirectory(templatePath) {
  const rootDirectory = getRootFolder(templatePath);
  var result = rootDirectory.concat("\\scripts\\localization");
  var removedIndex = templatePath.replace(rootDirectory, "");
  return result.concat(removedIndex);
}

/**
 * 
 * SCRIPT MAIN
 * 
 */

if (!process.argv[2]) { // path to extract strings from 
  console.error('ERROR: Workbook path not provided. Please provide the path to the workbook folder.');
  return;
}

// Verify directory path
var directoryPath = process.argv[2];
const exists = testPath(directoryPath);
if (!exists) {
  return;
}
// Valid args, start processing the files.
console.log(">>>>> Processing...");
const workbooksPath = directoryPath + WorkbookTemplateFolder;
const cohortsPath = directoryPath + CohortsTemplateFolder;

const workbooksDirectories = getDirectoriesRecursive(workbooksPath);
const cohortsDirectories = getDirectoriesRecursive(cohortsPath);
const directories = workbooksDirectories.concat(cohortsDirectories);
const locProjectOutput = [];

for (var d in directories) {
  const templatePath = directories[d];

  const files = fs.readdirSync(templatePath);
  if (!files || files.length === 0) {
    // No files in directory, continue
    continue;
  }

  // This is where we will output the resjson artifact
  const RESJSONOutputPath = generateOutputPath(templatePath, RESJSONOutputFolder);

  // Create string output dir
  if (!fs.existsSync(RESJSONOutputPath)) {
    fs.mkdirSync(RESJSONOutputPath, { recursive: true });
  }

  for (var i in files) {
    const fileName = files[i];
    // Get the contents of the workbook
    const isValid = isValidFileType(fileName);
    if (!isValid) {
      continue;
    }

    const filePath = templatePath.concat("\\", fileName);
    const data = openFile(filePath);

    // parse the workbook for strings
    var extracted = {};
    try {
      var workbookParsed = JSON.parse(data);
      getLocalizeableStrings(workbookParsed, '', extracted, fileName);

    } catch (error) {
      console.error("ERROR: Cannot extract JSON: ", filePath, "ERROR: ", error);
      continue;
    }

    if (Object.keys(extracted).length > 0) {
      const resjsonFileName = replaceFileExtension(fileName, ResJsonStringFileExtension);
      const lclFileName = replaceFileExtension(fileName, LCLStringFileExtension);

      // Add LocProject entry
      // For explanations on what each field does, see doc here: https://aka.ms/cdpxloc
      locProjectOutput.push({
        "SourceFile": RESJSONOutputPath.concat("\\", resjsonFileName),
        "LclFile": templatePath.concat(LangOutputSpecifier, lclFileName),
        "CopyOption": "LangIDOnPath",
        "OutputPath": templatePath.concat(LangOutputSpecifier, resjsonFileName)
      });

      // Write extracted strings to file
      writeToFileRESJSON(extracted, fileName, RESJSONOutputPath);

      const replaced = Object.assign({}, workbookParsed);
      // Generate new templates
      const locDirectory = getClonedLocDirectory(templatePath);
      if (locDirectory === "C:\\src\\Application-Insights-Workbooks\\scripts\\localization\\Workbooks\\Storage\\Overview") {
        for (var lang in Languages) {
          var translatedDir = generateOutputPath(templatePath, TemplateOutoutFolder);
          translatedDir = translatedDir.concat("\\", Languages[lang]);
          const fullpath = translatedDir.concat("\\", fileName);
          const fullLocPath = locDirectory.concat("\\", Languages[lang], "\\", lclFileName);
          if (fs.existsSync(fullLocPath)) {
            console.log(">>>>> Localization path exists exists!", fullLocPath);
            // Do workbook string replacement here
            const fileData = fs.readFileSync(fullLocPath, Encoding);
            generateTranslatedFile(fileData, replaced, translatedDir, fullpath);
          } else {
            // No loc file found, just push the workbook file as is in English
            writeTranslatedWorkbookToFile(replaced, translatedDir, fullpath);
          }
        }
      }
    } else {
      console.log(">>>>> No strings found for template: ", filePath);
    }
  };
}

// Generate and push locProject file
if (locProjectOutput.length > 0) {
  generateLocProjectFile(locProjectOutput, directoryPath.concat("\\"));
}

console.log("String extraction completed.");

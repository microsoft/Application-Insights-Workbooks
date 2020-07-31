const fs = require('fs')

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
]

const CategoryResourcesFile = "categoryResources.json";
const SettingsFile = "settings.json";

const Encoding = 'utf8';
const ResJsonStringFileExtension = 'resjson';
const LCLStringFileExtension = "resjson.lcl";

const WorkbookTemplateFolder = "\\Workbooks\\";
const CohortsTemplateFolder = "\\Cohorts\\";

const RESJSONOutputFolder = "\\output\\loc\\";

const LocProjectFileName = "LocProject.json";
const StringOutputPath = "\\strings";
const LangOutputSpecifier = "\\{Lang}\\";

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

/** Generates a output path for the template path by replacing template directory with output directory */
function generateRESJSONOutputPath(templatePath) {
  if (templatePath.includes(CohortsTemplateFolder)) {
    return templatePath.replace(CohortsTemplateFolder, RESJSONOutputFolder);
  } else {
    return templatePath.replace(WorkbookTemplateFolder, RESJSONOutputFolder);
  }
}

/** Validates file type. Expected to be either workbook/cohort file or settings/categoryjson file */
function isValidFileType(filename) {
  console.log("Found file: ", filename);
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
    console.error("Cannot open file: ", file, "ERROR: ", err);
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
      outputMap[jsonKey] = obj[i];

      // Check for parameters that should be locked
      findAndGenerateLockedStringComment(jsonKey, obj[i], outputMap);
    }
  }
}

/** Needed as entry in resjson file to keep parameter names from being translated */
function findAndGenerateLockedStringComment(jsonKey, stringToLoc, outputMap) {
  const params = findParameterNames(stringToLoc);
  if (params) {
    const commentKey = "_" + jsonKey + ".comment";
    const commentEntry = "{Locked=" + params.join(",") + "}"; // Add 'locked' comment to keep parameters from being translated
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
    console.error("Cannot extract parameter. ", "ERROR: ", e);
  }

  return params;
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
    console.error("Cannot write to file: ", fullpath, "ERROR: ", e);
  }
}

function getLocProjectFilePath(templatePath) {
  var root = "";
  if (templatePath.includes(CohortsTemplateFolder)) {
    root = templatePath.slice(0,templatePath.indexOf(CohortsTemplateFolder));
  } else {
    root = templatePath.slice(0,templatePath.indexOf(WorkbookTemplateFolder));
  }
  return root.concat("\\src");
}

/** Write a LocProject.json file needed to point the loc tool to the resjson files + where to output LCL files  */
function generateLocProjectFile(locItems, templatePath) {
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
    const pathToLocProjectFile = getLocProjectFilePath(templatePath);
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
 * 
 * SCRIPT MAIN
 * 
 */

if (!process.argv[2]) { // path to extract strings from 
  console.log('ERROR: Workbook path not provided. Please provide the path to the workbook folder.');
  return;
}

// Verify template path
const templatePath = process.argv[2];
const exists = testPath(templatePath);
if (!exists) {
  return;
}

// Valid args, start processing the files.
console.log("Processing...");

// This is where we will output the resjson artifact
const RESJSONOutputPath = generateRESJSONOutputPath(templatePath);

const locItems = [];

const files = fs.readdirSync(templatePath);

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
    getLocalizeableStrings(JSON.parse(data), '', extracted, fileName);
  } catch (error) {
    console.error("ERROR: Cannot extract JSON: ", filePath, "ERROR: ", error);
    continue;
  }

  if (Object.keys(extracted).length > 0) {
    const resjsonFileName = replaceFileExtension(fileName, ResJsonStringFileExtension);
    const lclFileName = replaceFileExtension(fileName, LCLStringFileExtension);

    // Add LocProject entry
    // For explanations on what each field does, see doc here: https://aka.ms/cdpxloc
    locItems.push({
      "SourceFile": RESJSONOutputPath.concat("\\", resjsonFileName),
      "LclFile": templatePath.concat(StringOutputPath, LangOutputSpecifier, lclFileName),
      "CopyOption": "LangIDOnPath",
      "OutputPath": templatePath.concat(StringOutputPath, LangOutputSpecifier, resjsonFileName)
    });

    // Write extracted strings to file
    writeToFileRESJSON(extracted, fileName, RESJSONOutputPath);
  } else {
    console.log(">>>>> No strings found for template: ", filePath);
  }
};

// Generate and push locProject file
console.log("Generating LocProject.json file...");
generateLocProjectFile(locItems, templatePath);

console.log("String extraction completed.");

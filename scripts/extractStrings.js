const fs = require('fs'), path = require('path');

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

const WorkbookTemplateFolder = "\\Workbooks\\";
const CohortsTemplateFolder = "\\Cohorts\\";

const RESJSONOutputFolder = "\\output\\loc\\";

const LocProjectFileName = "LocProject.json";
const StringOutputPath = "\\strings";

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
function generateRESJSONOutputPath(dir) {
  if (dir.includes(CohortsTemplateFolder)) {
    return dir.replace(CohortsTemplateFolder, RESJSONOutputFolder);
  } else {
    return dir.replace(WorkbookTemplateFolder, RESJSONOutputFolder);
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

function getResJSONFileName(fileName) {
  var a = fileName.split(".");
  const extension = a.pop();
  return fileName.replace(extension, ResJsonStringFileExtension);
}

/** Write string file as RESJSON */
function writeToFileRESJSON(data, fileName, outputPath) {
  const resjsonFileName = getResJSONFileName(fileName);
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

function getLocProjectFilePath(dir) {
  var root = "";
  if (dir.includes(CohortsTemplateFolder)) {
    root = dir.slice(0, dir.indexOf(CohortsTemplateFolder));
  } else {
    root = dir.slice(0, dir.indexOf(WorkbookTemplateFolder));
  }
  return root.concat("\\src");
}

function addLocProjectEntry(locItems, projectOutputs) {
  projectOutputs.push(
    {
      "LanguageSet": "Azure_Languages",
      "LocItems": locItems
    }
  );
}

/** Write a LocProject.json file needed to point the loc tool to the resjson files + where to output LCL files  */
function generateLocProjectFile(dir, projectOutputs) {
  const locProjectJson = {
    "Projects": projectOutputs
  };
  const content = JSON.stringify(locProjectJson, null, "\t");
  try {
    const pathToLocProjectFile = getLocProjectFilePath(dir);
    if (!fs.existsSync(pathToLocProjectFile)) {
      fs.mkdirSync(pathToLocProjectFile, { recursive: true });
    }
    fs.writeFileSync(pathToLocProjectFile.concat("\\", LocProjectFileName), content);
    console.log(">>>>> Generated LocProject.json file: ", pathToLocProjectFile, "\\", LocProjectFileName);
  } catch (e) {
    console.error("ERROR: Cannot write LocProject.json file: ", pathToLocProjectFile, "ERROR: ", e);
  }
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
var locProjectOutput = [];

for (var d in directories) {
  const dir = directories[d];
  const files = fs.readdirSync(dir);
  if (!files || files.length === 0) {
    // No files in directory, continue
    continue;
  }

  // This is where we will output the resjson artifact
  const RESJSONOutputPath = generateRESJSONOutputPath(dir);
  const locItems = [];

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

    const filePath = dir.concat("\\", fileName);
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
      const LCLOutputPath = dir.concat(StringOutputPath);
      const resjsonFileName = getResJSONFileName(fileName);

      // Add LocProject entry
      locItems.push({
        "SourceFile": RESJSONOutputPath.concat("\\", resjsonFileName),
        "CopyOption": "LangIDOnPath",
        "OutputPath": LCLOutputPath
      });

      // Write extracted strings to file
      writeToFileRESJSON(extracted, fileName, RESJSONOutputPath);
    } else {
      console.log(">>>>> No strings found for template: ", filePath);
    }
  };
  // Add an entry to locProject file
  addLocProjectEntry(locItems, locProjectOutput);
}

// Generate and push locProject file
console.log(">>>>> Generating LocProject.json file...");
if (locProjectOutput.length > 0) {
  generateLocProjectFile(directoryPath.concat("\\"), locProjectOutput);
}

console.log("String extraction completed.");

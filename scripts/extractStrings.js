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

const GalleryLocKeys = [
  "name",
  "label"
]

const LocalizableFileTypes = [
  "workbook",
  "cohort",
  "json"
];

const GalleryFile = "_gallery";
const IndexFile = "_index";

const CategoryResourcesFile = "categoryResources.json";

const Encoding = 'utf8';
const ResJsonStringFileExtension = 'resjson';

const PathToLocProjectFile = "..\\src\\LocProject.json";

/**
 * FUNCTIONS 
 */

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

function isValidFileType(filename) {
  console.log("Found file: ", filename);
  if (filename.startsWith(IndexFile)) { // Don't translate index file
    return false;
  }
  if (filename.localeCompare(CategoryResourcesFile) == 0) {
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
    console.error(err);
  }
}

function getLocalizeableStrings(obj, key, outputMap, filename) {
  for (var i in obj) {
    if (!obj.hasOwnProperty(i)) {
      continue;
    }
    if (typeof obj[i] == 'object') {
      getLocalizeableStrings(obj[i], key.concat(i, '.'), outputMap, filename);
    } else if (filename.startsWith(GalleryFile)) {
      if (GalleryLocKeys.includes(i)) {
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

function findAndGenerateLockedStringComment(jsonKey, stringToLoc, outputMap) {
  const params = findParameterNames(stringToLoc);
  if (params) {
    const commentKey = "_" + jsonKey + ".comment";
    const commentEntry = "{Locked=" + params.join(",") + "}";
    outputMap[commentKey] = commentEntry;
  }
}

function findParameterNames(text) {
  const ValidParameterNameRegex = "[_a-zA-Z\xA0-\uFFFF][_a-zA-Z0-9\xA0-\uFFFF]*";
  const ValidSpecifierRegex = "[_a-zA-Z0-9\xA0-\uFFFF\\-\\$\\@\\.\\[\\]\\*\\?\\(\\)\\<\\>\\=\\,\\:]*";
  var _parameterRegex = new RegExp("\{" + ValidParameterNameRegex + "(:" + ValidSpecifierRegex + ")?\}", "g");
  var params = null;
  try {
    params = text.match(_parameterRegex);
  } catch (error) {
    console.error("Cannot extract parameter. ", "ERROR: ", e);
  }

  return params;
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
  if (content.localeCompare("{}") == 0) {
    console.log("No strings found for: ", fileName);
    return;
  }

  try {
    fs.writeFileSync(fullpath, content);
    console.log(">>>>> Wrote to file: ", fullpath);
  } catch (e) {
    console.error("Cannot write to file: ", fullpath , "ERROR: ", e);
  }
}

/** Write a LocProject.json file needed to point the loc tool to the resjson files + where to output LCL files  */
function generateLocProjectFile(locItems) {
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
    fs.writeFileSync(PathToLocProjectFile, content);
    console.log(">>>>> Generated LocProject.json file: ", PathToLocProjectFile);
  } catch (e) {
    console.error("Cannot write LocProject.json file: ", PathToLocProjectFile, "ERROR: ", e);
  }
}


/**
 * 
 * SCRIPT MAIN
 * 
 */

if (!process.argv[2] || !process.argv[3]) { // path to extract strings from and output path
  console.log('ERROR: Workbook path not provided. Please provide the path to the workbook to localize and the output path for the extracted strings.');
  return;
}

// var currentDir = process.cwd();
// Verify template path
const templatePath = process.argv[2];
const outputPath = process.argv[3];
const exists = testPath(templatePath);
if (!exists) {
  return;
}

console.log("Processing...");

const locItems = [];

// Valid args, start processing the files.
var files = fs.readdirSync(templatePath);

// Create string output dir
if (!fs.existsSync(outputPath)) {
  fs.mkdirSync(outputPath, { recursive: true });
}

for (var i in files) {
  const fileName = files[i];
  // Get the contents of the workbook
  const isValid = isValidFileType(fileName);
  if (!isValid) {
    continue;
  }

  var filePath = templatePath + "\\" + fileName;
  const data = openFile(filePath);

  // parse the workbook for strings
  var extracted = {};
  try {
    getLocalizeableStrings(JSON.parse(data), '', extracted, fileName);
  } catch (error) {
    console.log("ERROR: Cannot extract JSON: ", filePath);
    continue;
  }

  if (Object.keys(extracted).length > 0) {
    const LCLOutputPath = templatePath + "\\strings";
    const resjsonFileName = getResJSONFileName(fileName);

    // Add LocProject entry
    locItems.push({
      "SourceFile": outputPath.concat(resjsonFileName),
      "CopyOption": "LangIDOnPath",
      "OutputPath": LCLOutputPath
    });

    // Write extracted strings to file
    writeToFileRESJSON(extracted, fileName, outputPath);
  } else {
    console.log(">>>>> No strings found for template: ", filePath);
  }
};

// Generate and push locProject file
console.log("Generating LocProject.json file...");
generateLocProjectFile(locItems);

console.log("String extraction completed.");

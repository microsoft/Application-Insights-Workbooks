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
  "typeSettings",
  "noDataMessage"
];

const Encoding = 'utf8';
const ResJsonStringFileExtension = '.resjson';
const ResJSonCommentKey = "_{0}.comment";

const LCLOutputPath = "Workbooks\\.localization";
const PathToStringFile = "output\\package\\en-us\\Workbooks\\";
const PathToLocProjectFile = "..\\src\\LocProject.json";

// FUNCTIONS
function testPath(path) {
  console.log(">>>>> Processing template path: ", path);
  if (fs.existsSync(path)) {
    console.log("Path verified.");
    return true;
  } else {
    console.error("Template path does not exist: ", path);
    return false;
  }
}


function isValidFileType(filename) {
  if (filename.startsWith("_gallery") || filename.startsWith("_index")) {
    return false;
  }
  var a = filename.split(".");
  if (a.length === 1 || (a[0] === "" && a.length === 2)) {
    return false;
  }
  const extension = a.pop();
  return extension && extension.toLowerCase() === "json";
}

function openWorkbook(file) {
  try {
    console.log(">>>>> Processing workbook: ", file);
    const data = fs.readFileSync(file, Encoding);
    return data;
  } catch (err) {
    console.error(err);
  }
}

function getLocalizeableStrings(obj, key, outputMap) {
  for (var i in obj) {
    if (!obj.hasOwnProperty(i)) {
      continue;
    }
    if (typeof obj[i] == 'object') {
      getLocalizeableStrings(obj[i], key.concat(i, '.'), outputMap);
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

/** Write string file as RESJSON */
function writeToFileRESJSON(data, fileName, path) {
  const parts = path.split('\\');
  var directoryPath = '';

  for (var i = 0; i < parts.length - 1; i++) {
    directoryPath = directoryPath.concat(parts[i], '\\');
  }

  const fullpath = directoryPath.concat("strings\\", fileName.replace(".json", ResJsonStringFileExtension));

  const content = JSON.stringify(data, null, "\t");
  if (content.localeCompare("{}") == 0) {
    console.log("No strings found for: ", fileName);
    return;
  }

  try {
    fs.writeFileSync(fullpath, content);
    console.log(">>>>> Wrote to file: ", fullpath);
  } catch (e) {
    console.error("Cannot write file: ", "fullpath", "ERROR: ", e);
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


// SCRIPT MAIN

if (!process.argv[2]) { // path to the extracted workbooks
  console.log('ERROR: Workbook path not provided. Please provide the path to the workbook to localize.');
  return;
}

// Verify template path
const templatePath = process.argv[2];
const exists = testPath(templatePath);
if (!exists) {
  return;
}

console.log("Processing...");

const locItems = [];

// Valid path, start processing the files.
var files = fs.readdirSync(templatePath);

// Create string output dir
const stringOutputDir = templatePath.concat("\\strings");
if (!fs.existsSync(stringOutputDir)) {
  fs.mkdirSync(stringOutputDir);
}

for (var i in files) {
  const fileName = files[i];
  // Get the contents of the workbook
  const isValid = isValidFileType(fileName);
  if (!isValid) {
    continue;
  }

  const filePath = templatePath + "\\" + fileName;
  const data = openWorkbook(filePath);

  // parse the workbook for strings
  var extracted = {};
  try {
    getLocalizeableStrings(JSON.parse(data), '', extracted);
  } catch (error) {
    console.log("ERROR: Cannot extract JSON: ", filePath);
    continue;
  }

  if (Object.keys(extracted).length > 0) {
    const outPath = templatePath + "\\strings";

    // Add LocProject entry
    locItems.push({
      "SourceFile": PathToStringFile.concat(fileName),
      "CopyOption": "LangIDOnPath",
      "OutputPath": LCLOutputPath
    });

    // Write extracted strings to file
    writeToFileRESJSON(extracted, fileName, outPath);
  } else {
    console.log(">>>>> No strings found for template: ", path);
  }
};

// Generate and push locProject file
console.log("Generating LocProject.json file...");
generateLocProjectFile(locItems);

console.log("String extraction completed.");


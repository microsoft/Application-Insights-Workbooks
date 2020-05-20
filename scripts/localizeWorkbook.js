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
const ResxFileName = 'strings.resx';

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
      outputMap[key.concat(i)] = obj[i];
    }
  }
}

/** Write string file as RESJSON */
function writeToFileRESJSON(data, fileName, path) {
  const parts = path.split('\\');
  var directoryPath = '';

  for (var i = 0; i < parts.length - 1; i++) {
    directoryPath = directoryPath.concat(parts[i], '\\');
  }

  const fullpath = directoryPath.concat("strings\\", fileName.replace(".json", ResJsonStringFileExtension));

  console.log("...Path: ", fullpath);
  const content = JSON.stringify(data, null, "\t");
  if (content === "{}") {
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
  const filePath = templatePath + "\\" + fileName;
  const isValid = isValidFileType(filePath);
  if (!isValid) {
    continue;
  }

  const data = openWorkbook(filePath);

  // parse the workbook for strings
  var extracted = {};
  getLocalizeableStrings(JSON.parse(data), '', extracted);

  const outPath = templatePath + "\\strings";

  // Write extracted strings to file
  writeToFileRESJSON(extracted, fileName, outPath);
};

console.log("String extraction completed.");


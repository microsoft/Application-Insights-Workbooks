const fs = require('fs')

// Keys to localize. Add new keys here.
const Keys = [
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
const StringFileName = 'strings.json';
const ResxFileName = 'strings.resx';

const ResxBegin =
    `<?xml version="1.0" encoding="utf-8"?>
<root>
  <xsd:schema id="root" xmlns="" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:msdata="urn:schemas-microsoft-com:xml-msdata">
    <xsd:import namespace="http://www.w3.org/XML/1998/namespace" />
    <xsd:element name="root" msdata:IsDataSet="true">
      <xsd:complexType>
        <xsd:choice maxOccurs="unbounded">
          <xsd:element name="metadata">
            <xsd:complexType>
              <xsd:sequence>
                <xsd:element name="value" type="xsd:string" minOccurs="0" />
              </xsd:sequence>
              <xsd:attribute name="name" use="required" type="xsd:string" />
              <xsd:attribute name="type" type="xsd:string" />
              <xsd:attribute name="mimetype" type="xsd:string" />
              <xsd:attribute ref="xml:space" />
            </xsd:complexType>
          </xsd:element>
          <xsd:element name="assembly">
            <xsd:complexType>
              <xsd:attribute name="alias" type="xsd:string" />
              <xsd:attribute name="name" type="xsd:string" />
            </xsd:complexType>
          </xsd:element>
          <xsd:element name="data">
            <xsd:complexType>
              <xsd:sequence>
                <xsd:element name="value" type="xsd:string" minOccurs="0" msdata:Ordinal="1" />
                <xsd:element name="comment" type="xsd:string" minOccurs="0" msdata:Ordinal="2" />
              </xsd:sequence>
              <xsd:attribute name="name" type="xsd:string" use="required" msdata:Ordinal="1" />
              <xsd:attribute name="type" type="xsd:string" msdata:Ordinal="3" />
              <xsd:attribute name="mimetype" type="xsd:string" msdata:Ordinal="4" />
              <xsd:attribute ref="xml:space" />
            </xsd:complexType>
          </xsd:element>
          <xsd:element name="resheader">
            <xsd:complexType>
              <xsd:sequence>
                <xsd:element name="value" type="xsd:string" minOccurs="0" msdata:Ordinal="1" />
              </xsd:sequence>
              <xsd:attribute name="name" type="xsd:string" use="required" />
            </xsd:complexType>
          </xsd:element>
        </xsd:choice>
      </xsd:complexType>
    </xsd:element>
  </xsd:schema>
  <resheader name="resmimetype">
    <value>text/microsoft-resx</value>
  </resheader>
  <resheader name="version">
    <value>2.0</value>
  </resheader>
  <resheader name="reader">
    <value>System.Resources.ResXResourceReader, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089</value>
  </resheader>
  <resheader name="writer">
    <value>System.Resources.ResXResourceWriter, System.Windows.Forms, Version=4.0.0.0, Culture=neutral, PublicKeyToken=b77a5c561934e089</value>
  </resheader>\r\n`;

const ResXEnd = '</root>';

const ResXEntryEnd = '</data>';

// FUNCTIONS
function testPath(path) {
    if (fs.existsSync(path)) {
        // file exists
        console.log("Found file...", path);
        return true;
    } else {
        console.error("File doesn't exist");
        return false;
    }
}


function isValidFileType(filename) {
    const parts = filename.split('.');
    const extension = parts[parts.length - 1];
    return extension === "workbook" || extension === "cohort";
}

function openWorkbook(file) {
    try {
        const data = fs.readFileSync(file, Encoding);
        return data;
    } catch (err) {
        console.error(err);
    }
}

function getObjects(obj, objKey, outputMap) {
    const key = (objKey || '').concat('.');
    for (var i in obj) {
        if (!obj.hasOwnProperty(i)) {
            continue;
        }
        if (typeof obj[i] == 'object') {
            getObjects(obj[i], key.concat(i), outputMap);
        } else if (Keys.includes(i)) {
            outputMap[key] = obj[i];
        }
    }
}

/** Write string file as JSON */
function writeToFileJSON(data, path) {
    const parts = path.split('\\');
    var directoryPath = '';
    for (var i = 0; i < parts.length - 1; i++) {
        directoryPath = directoryPath.concat(parts[i], '\\');
    }
    const fullpath = directoryPath.concat(StringFileName);
    console.log(directoryPath);
    const content = JSON.stringify(data, null, "\t");
    try {
        fs.writeFileSync(fullpath, content);
        console.log("Wrote to file... ", fullpath);
        console.log("String file generated. Please check the file in.")
    } catch (e) {
        console.log("Cannot write file ", e);
    }
}

/** Write string file as ResX format */
function writeToFileResX(data, path) {
    const parts = path.split('\\');
    var directoryPath = '';
    for (var i = 0; i < parts.length - 1; i++) {
        directoryPath = directoryPath.concat(parts[i], '\\');
    }
    const fullpath = directoryPath.concat(ResxFileName);
    console.log(directoryPath);
    try {
        const writeStream = fs.createWriteStream(fullpath, {
            flags: 'a'
        });

        return new Promise((resolve, reject) => {
            writeStream.on("error", reject);
            writeStream.on("finish", resolve);

            // Start of resx file
            writeStream.write(ResxBegin);

            // Begin writing definitions
            for (var key in data) {
                const val = data[key];
                const definition = `<data name="${key}" xml:space="preserve">`;
                const value = `<value>"${val}"</value>`;

                writeStream.write('\t' + definition + '\r\n');
                writeStream.write('\t\t' + value + '\r\n');
                writeStream.write('\t' + ResXEntryEnd + '\r\n');
            }

            writeStream.write(ResXEnd);

            console.log("Wrote to file... ", fullpath);
            console.log("String file generated. Please check the file in.");
            writeStream.close();
        });

    } catch (e) {
        console.log("Cannot write file: ", e);
    }
}

// SCRIPT
if (!process.argv[2]) {
    console.log('Workbook path not provided. Please provide the path to the workbook to localize.');
} else {
    const filePath = process.argv[2];
    const exists = testPath(filePath);
    if (!exists) {
        return;
    }

    const isValid = isValidFileType(filePath);
    if (!isValid) {
        console.error("The provided path does not contain a workbook. The extension must end with .workbook or .cohort");
        return;
    }
    // Valid workbook, start read the content
    const data = openWorkbook(filePath);
    var map = {};
    getObjects(JSON.parse(data), '', map);
    console.log(map);

    // Write new strings to file
    // writeToFile(map, filePath);
    writeToFileResX(map, filePath);
}

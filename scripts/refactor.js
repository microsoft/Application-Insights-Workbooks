const fs = require('fs');
const path = require('path');


const directories =["C:\\src\\Application-Insights-Workbooks\\output\\package\\en-us\\Cohorts", "C:\\src\\Application-Insights-Workbooks\\output\\package\\en-us\\Workbooks"];
for (var d in directories) {
    const dirPath = directories[d];
    const files = fs.readdirSync(dirPath);
    for (var i in files) {
        const fileName = files[i];
        if (fileName.startsWith("_gallery.")) {
            const fullPath = dirPath.concat("\\", fileName);
            const data = fs.readFileSync(fullPath, 'utf8');
            var jsonParsedData = JSON.parse(data);
            var newData = {};
            const keys = Object.keys(jsonParsedData);
            keys.forEach(key => {
                newData[key] = jsonParsedData[key];
                var templates = newData[key]["templates"];
                templates.sort((a, b) => (a.order > b.order) ? 1 : -1);
                templates.forEach(template => {
                     template["fileName"] = undefined;
                     template["order"] = undefined;
                });
            });

            const newlocation = "C:\\src\\Application-Insights-Workbooks\\gallery\\";
            const newFileName = fileName.replace("_gallery.", "");
            const newFile = newlocation.concat(newFileName);
            const content = JSON.stringify(newData, null, "\t");
            fs.writeFileSync(newFile, content);
        }
    }
}







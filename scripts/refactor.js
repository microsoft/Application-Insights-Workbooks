const fs = require('fs');

const directories = ["C:\\src\\Application-Insights-Workbooks\\output\\package\\en-us\\Cohorts", "C:\\src\\Application-Insights-Workbooks\\output\\package\\en-us\\Workbooks"];
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
            // TODO, use the below schema instead
            //newData["$schema"] = "https://raw.githubusercontent.com/microsoft/Application-Insights-Workbooks/master/schema/gallery.json";
            newData["$schema"] = "https://raw.githubusercontent.com/microsoft/Application-Insights-Workbooks/users/erlin/newGalleryDefinition/schema/gallery.json";
            newData["version"] = "TemplateGallery/1.0";
            const keys = Object.keys(jsonParsedData);
            var categories = [];
            keys.forEach(key => {
                if (key !== "$schema" && key !== "version" && key !== "categories") {
                    var category = jsonParsedData[key];
                    var templates = category["templates"];
                    templates.sort((a, b) => (a.order > b.order) ? 1 : -1);
                    templates.forEach(template => {
                        template["fileName"] = undefined;
                        template["order"] = undefined;
                    });

                    var newCategory = {};
                    newCategory = { "id": key };
                    var categoryKeys = Object.keys(category);
                    categoryKeys.forEach(key => {
                        newCategory[key] = category[key];
                    });
                    categories.push(newCategory);
                }
            });

            categories.sort((a, b) => (a.order > b.order) ? 1 : -1);
            categories.forEach(c => {
                c["order"] = undefined;
            });
            newData["categories"] = categories;


            const newlocation = "C:\\src\\Application-Insights-Workbooks\\gallery\\";
            const newFileName = fileName.replace("_gallery.", "");
            const newFile = newlocation.concat(newFileName);
            const content = JSON.stringify(newData, null, "\t");
            fs.writeFileSync(newFile, content);
        }
    }
}







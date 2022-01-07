# Contributing to the Template Gallery

If you haven't already read the top level [Contributing](../CONTRIBUTING.md) docs, read that first to find out how to get contributor access to the repo.

## Template Format
Workbook templates follow a certain folder structure.
```
Root
 |
 |- Workbooks
       |- Category A
             |- Template A
                    |- TemplateA.workbook
                    |- icon.svg
             |- Template B
                    |- TemplateB.workbook
                    |- icon.svg
       |- Category B
             |- Template C
                    |- TemplateC.workbook
                    |- icon.svg
             |- Template D
                    |- TemplateD.workbook
                    |- icon.svg
```

## Gallery folder
```
Root
 |
 |- gallery folder
    | Workbook type A
        |- galleryA.json
        |- galleryB.json 
    | Workbook type B
        |- galleryA.json
        |- galleryB.json
        
...       
```
Each template can live in one or more galleries. The template galleries of the Workbooks tools are organized into categories, like Business Hypotheses, Performance, and Usage. Each category can contain many templates.
![Image of category view](./Images/CategoryView.png)

## Template folder
Each category folder contains a list of templates folders that contain templates.
```
|- Category A
        |- Template A
            |- TemplateA.workbook
            |- icon.svg
        |- Template B
            |- TemplateB.workbook
            |- icon.svg
```

Avoid using special characters (like `/\&?`) in your folder names. An optional icon file can be a PNG, SVG, or other common image format. Only one icon file per template is currently supported.

Each template folder should contain a **.workbook file**. You can create a template file from Workbooks in the Azure portal. See the ["How to create a .workbook file"](#How-to-create-a-.workbook-file) section for more details.  Ideally, the filename of the template is the same as its folder name, to make items easier to find by name.

## How to create a .workbook file
There are three ways of creating a template. 
* Create from the default template.
* From the existing template. You can modify or enhance the existing template.
* From the existing report. You can modify or enhance the existing report.

## Create from the default template
1. Go to http://portal.azure.com 
2. Select an Application Insights resource or go to Azure Monitor from the navigation bar
3. Select "Workbooks"
4. Select the Empty template under Quick Start section.

    ![Image of empty template](./Images/EmptyTemplate.png)

5. Modify report as you wish and click "Advanced Editor" button from the menu. 

    ![Image of toolbar](./Images/Toolbar-AdvancedEditor.png)

6. Use the download button or copy all contents and create a file like `your custom template name.workbook`. 
   Make sure the file name ends with `.workbook` and avoid using any special characters (like `/\&?`) in your file name.
    ![advanced editor](./Images/AdvancedEditor.png)

## Create from an existing template
1. Go to http://portal.azure.com 
2. Select an Application Insights resource or Azure Monitor from the navigation bar.
3. Select "Workbooks"
4. Select a template you are interested.
5. Modify report as you wish and click "Advanced Editor" button from the menu. 
6. Use the download button, or copy contents and create a file like `your custom template name.workbook`. 
   Make sure the file name ends with `.workbook` and avoid using any special characters (like `/\&?`) in your file name.
	
## Create from an existing report
1. Go to http://portal.azure.com 
2. Select an Application Insights resource or Azure Monitor from the navigation bar.
3. Select "Workbooks"
4. Click on Open icon from the menu.
5. Select a desired saved report you want to start with.
6. Modify report as you wish and click "Advanced Editor" button from the menu. 
7. Use the download button, or copy contents and create a file like `your custom template name.workbook`. 
   Make sure the file name ends with `.workbook` and avoid using any special characters (like `/\&?`) in your file name.

## Gallery file
 A gallery file associates your templates with a gallery and category. The following is an example of what a gallery file should look like. In the case where you would like to add a template to a gallery that exists, you should modify the existing gallery file.
 ```json
{
    "$schema": "https://raw.githubusercontent.com/microsoft/Application-Insights-Workbooks/master/schema/gallery.json",
    "version": "TemplateGallery/1.0",
    "categories": [
        {
            "id": "MyCategory",
            "name": "My category",
            "templates": [
                {
                    "id": "Workbooks/CategoryA/TemplateA",
                    "name": "My template (preview)",
                    "description": "Description of the template",
                    "author": "Microsoft",
                    "isPreview": true
                }
            ]
        }
    ]
}
```

* `$schema`: The link to the gallery schema. This should be `"https://raw.githubusercontent.com/microsoft/Application-Insights-Workbooks/master/schema/gallery.json"`

* `version`: Gallery version (eg. `TemplateGallery/1.0`)

* `categories`: A list of categories for this gallery. *Note*: The order of categories in this list determines the order of the categories that will appear in this gallery

    * `id`: The ID for the category. This field will not be localized

    * `name`: The name of the category. This field will be localized
    
    * `templates`: A list of templates for the category. *Note*: The order of the templates in this list determines the order of the templates that will appear in this category

        * `id`: The ID for the template. This ID should be the path to your template folder (eg. `Workbooks/Performance/Apdex`)

        * `name`: The name of the template. This field will be localized

        * `description`: The description for the template. This field will be localized

        * `author`: Author for this template (eg. `Microsoft`)

        * `icon`: Optional. If you don't specify "icon" property, it will use the default icon. Otherwise, specify the name of icon file that is located under the template folder.

        * `tags`: Optional. You can specify a list of tags that describes the template.

        * `isPreview`: Optional. Flag to mark the template as preview. See [Testing Preview Workbook Templates](#testing-preview-workbook-templates) for more details

For more details on the schema of the gallery file, view the [Gallery JSON schema](./schema/gallery.json).

## How to create and name a gallery file
Gallery files are created under the `\gallery` folder. A gallery subfolder should be created for each Workbook type. The gallery file should live under the corresponding Workbook type subfolder. The gallery file name is the ARM resource type where slashes in the resource type are replaced with `'-'`.

For example, if your workbook type is 'workbook' and your ARM resource type is 'microsoft-insights/components', then your gallery file should be under the `workbook` subfolder with gallery file named `microsoft.insights-components.json`.

Note: Workbook types are known types, are not arbitrary, and controlled by the Workbooks team. 

### Gallery Restrictions
- A template can be associated with one or more galleries
- A template should only appear once in a category
- A category should only appear once in a gallery

# How to make changes (add, modify templates)

1. Clone the repo, if you haven't already. If you have already, `git checkout master` and `git pull` to make sure you are up to date
2. Create a new branch `git checkout -b nameOfNewBranch`
3. Create a folder in the `Workbooks` folder, or find an existing category folder if you are making a new category
4. Within that folder, create a new folder for your new workbook.  Put your .workbook file there.
    * the "id" for your workbook will be the folder path itself, like `Workbooks\My New Category\My New Workbook\my workbook.workbook` would have an id of `My New Category\My New Workbook`
5. Add your template to a gallery by adding an entry for your category and template in the gallery file under the `\gallery` folder
6. Add your new files to the branch with the appropriate `git add` command
7. Commit your changes to your branch with git commit, with a useful message, like `git commit -m "Adding my new workbook to my new category"`
8. Push your branch to the github repo via git push: `git push -u origin nameOfNewBranch`

# How to test your changes
See [Testing](./Testing.md) on how to test your changes.
# How to publish your changes

1. After you are done, push your branch to the github repo via git push: `git push -u origin nameOfNewBranch`
2. Ensure that if you are adding a new template, it has a corresponding entry in the gallery files.
3. If you are adding a new template and/or gallery file, and you would like to take ownership of the files, add an entry for your team in `CODEOWNERS`. CODEOWNERS entries should be teams, not individuals.
4. In Github, create a pull request for your new branch to master. Again, use useful text for the name of your PR and in the PR, describe what you are changing, what your workbook does, add a screenshot if possible.
5. A validation build will take place to make sure your workbook is valid json, doesn't have hardcoded resource ids, etc.
6. If your build passes, and someone else with write access to the repo approves your PR, complete your PR
7. Upon the next [deployment](Deployment.md), your template will appear in the portal

# Testing Preview Workbook Templates

You can test templates that are still work in progress or simply not ready to be exposed to all users. To do this you need to add the property `"isPreview: true"` in the gallery file.
Here is an example:

```jsonc
{
	"$schema": "https://raw.githubusercontent.com/microsoft/Application-Insights-Workbooks/master/schema/gallery.json",
	"version": "TemplateGallery/1.0",
	"categories": [
		{
			"id": "MyCategory",
			"name": "My category",
			"templates": [
				{
					"id": "Workbooks/CategoryA/TemplateA",
					"name": "My template (preview)",
                    "description": "Description of the template",
					"author": "Microsoft",
                    "isPreview": true // add this line to make this a preview template
				}
			]
		}
	]
}
```

Once you have add marked your template as `isPreview`, you can see this workbook by adding `feature.includePreviewTemplates` in your Azure Portal Url. So your URL looks something like [https://portal.azure.com/?feature.includePreviewTemplates=true](https://portal.azure.com/?feature.includePreviewTemplates=true).


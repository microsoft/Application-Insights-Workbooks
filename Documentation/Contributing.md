# Contributing to the Template Gallery

## Template Format
Workbook templates follow a certain folder structure.
```
Root
 |
 |- Workbooks
       |- Category A
             |- categoryResources.json
             |- Template A
                    |- A.template
                    |- settings.json
                    |- icon.svg
                    |- ko-kr
                        |- A.template
                        |- settings.json
             |- Template B
                    |- B.template
                    |- settings.json
                    |- icon.svg
                    |- ko-kr
                        |- B.template
                        |- settings.json
       |- Category B
             |- categoryResources.json
             |- Template C
                    |- C.template
                    |- settings.json
                    |- icon.svg
                    |- ko-kr
                        |- C.template
                        |- settings.json
             |- Template D
                    |- D.template
                    |- settings.json
                    |- icon.svg
                    |- ko-kr
                        |- D.template
                        |- settings.json
```
## Category folder
```
Root
 |
 |- Workbooks
       |- Category folder 1
       |- Category folder 2       
...       
```
The template galleries of the Workbooks tools are organized into categories, like Business Hypotheses, Performance, and Usage. Each category can contain many templates.
![Image of category view](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/CategoryView.png)

To define a category, specify a categoryResources.json file per the category folder. The categoryResources.json file contains localized versions of the category name, and a description. Here's an example categoryResources.json file.
```
{
    "en-us": {"name":"Business Hypotheses", "description": "Long description goes here", "order": 100},
    "es-mx": {"name":"Hipótesis de negocios", "description": "Descripción larga va aquí", "order": 100},
    "ko-kr": {"name":"비즈니스 추측", "description": "설명은 여기에...", "order": 100},
}
```

The name of language uses **language culture format.**

## Template folder
Each category folder contains a list of templates.
```
       |- Category A
             |- categoryResources.json
             |- Template A
                    |- A.template
                    |- settings.json
                    |- icon.svg
                    |- ko-kr
                        |- A.template
                        |- settings.json
             |- Template B
                    |- B.template
                    |- settings.json
                    |- icon.svg
                    |- ko-kr
                        |- B.template
                        |- settings.json
```

Each template folder contains a list of language folders and an optional icon file. Languages are given as language culture format abbreviations, like "en" instead of "en-us".

The optional icon file can be a PNG, SVG, or other common image format. Only one icon file per template is currently supported.

Each language folder contains the following files:
* **.workbook file** - You can create a template file from Workbooks in the Azure portal. See the "How to create a .workbook file" section for more details.
* **settings.json file** - This file describes a template with metadata. You can specify a localized version of metadata per a language folder.
    ```
        {
            "name":"Improving User Retention",
            "description": "Long description goes here",
            "icon": "",
            "tags": ["Foo", "Bar"],
            "author": "Microsoft",
            "galleries": [{ "type": "workbook", "resourceType": "microsoft.insights/components", "order": 300 }]
            "order": 100
        }
    ```
    * name: A localized name.
    * description: A localized description.
    * icon: Optional. If you don't specify "icon" property, it will use the default icon. Otherwise, specify the name of icon file that is located under the template folder. 
    * tags: Optional. You can specify a list of tags that describes the template.
    * author: The name of author or company who contributes.
    * galleries: Optional. Settings for gallery view. Please note that this is only available for Workbooks reportType.
        * type: Workbook type like 'tsg', 'performance', and etc. The default value is 'workbook'
        * resourceType: ARM resource type. The default value is 'microsoft.insigths/components'
        * order: When specified it will be display in the ascending order.
    * order: If you have more than one template within a category and would like to order them in certain way, you can specify sort order. This will be overriden by the order within galleries if available.

## How to create a .workbook file
There are three ways of creating a template. 
* Create from the default template.
* From the existing template. You can modify or enhance off of the existing template.
* From the existing report. You can modify or enhance off of the existing report.

## Create from the default template
1. Go to http://portal.azure.com 
2. Select an Application Insights resource
3. Select "Workbooks"
4. Select Default Template under Quick Start section.<br/>
    ![Image of default template](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/DefaultTemplate.png)
5. Modify report as you wish and click "Advanced Editor" button from the menu. Copy all contents and create a file like "your custom template name.template". Please make sure file name ends with '.workbook'.<br/>
![Image of toolbar](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/Toolbar-AdvancedEditor.png)

## Create from an existing template
1. Go to http://portal.azure.com 
2. Select an Application Insights resource or Azure Monitor from the navigation bar.
3. Select "Workbooks"
4. Select a template you are interested.<br/>
    ![Image of default template](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/Existing-Template.png)

5. Modify report as you wish and click "Advanced Editor" button from the menu. Copy all contents and create a file like "your custom template name.template". Please make sure file name ends with '.workbook'.<br/>
![Image of toolbar](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/Toolbar-AdvancedEditor.png)
	
## Create from an existing report
1. Go to http://portal.azure.com 
2. Select an Application Insights resource or Azure Monitor from the navigation bar.
3. Select "Workbooks"
4. Click on Open icon from the menu.
5. Select a desired saved report you want to start with.<br/>
    ![Image of default template](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/SavedList.png)

6. Modify report as you wish and click "Advanced Editor" button from the menu. Copy all contents and create a file like "your custom template name.template". Please make sure file name ends with '.workbook'.

## How to associate any existing template to an additional category in Workbooks
We are now supporting associating any exiting templates to an additional category (virtual category). Previously, a category was always associated with templates by a folder structure but this requires to create physical folder structure which requires copying existing templates. This would introduce a lot of maintenance overhead of updating duplicated templates.

First, to associate the existing template, we need to create a virtual category first.
1. Go to Workbooks folder and locate "resourceCategory.json" file.
2. Add new category entry under categories array as below:
    ```
    {
    "categories": [{
            "key": "YourSampleUniqueCategoryKey",
            "settings": {
            "en-us": {
                "name": "Sample Category",
                "description": "Category description",
                "order": 100
                }
            }      
        }]
    }
    ```
    * key: This should be unique key value. This will be used in a template to link together.
    * settings:
        * name: This is a name of category. This will be localized.
        * description: A description of this category.
        * order: The sort order of category.
3. Now we need to modify template settings to associate it together.
4. Go to your template and open settings.json file
    ```
    {
        "$schema": "https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/schema/settings.json",
        "name": "Bracket Retention",
        "author": "Microsoft",
        "galleries": [
            {
                "type": "workbook",
                "resourceType": "microsoft.insights/components",
                "order": 400
            },
            // This is the new section to add:
            {
                "type": "workbook",
                "resourceType": "Azure Monitor",
                "categoryKey": "YourSampleUniqueCategoryKey"
                "order": 400
            }
        ]
    }
    ```
    **Note that the second item in the galleries array, it has a "categoryKey". It should be match with a "key" in a virtual category.**

## now that you have your workbook and settings files...

1. clone the repo, if you haen't already.
2. create a new branch `git checkout -b nameOfNewBranch`
3. create a folder in the `Workbooks` folder, or find an existing category folder if you are making a new category
4. within that folder, create a new folder for your new workbook.  Put your .workbook and settings.json file there.
    * the "id" for your workbook will be the folder path itself, like `Workbooks\My New Category\My New Workbook\my workbook.workbook` would have an id of `My New Category\My New Workbook`
5. add your new files to the branch with the appropriate `git add` command
6. commit your changes to your branch with git commit, with a useful message, like `git commit -m "Adding my new workbook to my new category"`
7. push your branch to the github repo via git push: `git push -u origin nameOfNewBranch`
8. in github, create a pull request for your new branch to master. Again, use useful text for the name of your PR and in the PR, describe what you are changing, what your workbook does, add a screenshot if possible.
9. A validation build will take place to make sure your workbook is valid json, doesn't have hardcoded resource ids, etc.
10. if your build passes, and someone else with write access to the repo approves your PR, complete your PR
11. within a few minutes, you should see your new workbook in the appropriate gallery in the portal.


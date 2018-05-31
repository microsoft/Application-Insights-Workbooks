# Contributing

This project welcomes contributions and suggestions.  Most contributions require you to agree to a
Contributor License Agreement (CLA) declaring that you have the right to, and actually do, grant us
the rights to use your contribution. For details, visit https://cla.microsoft.com.

When you submit a pull request, a CLA-bot will automatically determine whether you need to provide
a CLA and decorate the PR appropriately (e.g., label, comment). Simply follow the instructions
provided by the bot. You will only need to do this once across all repos using our CLA.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/).
For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or
contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.

# What is this repository for?
This repository contains the templates shown in the template galleries of the [Application Insights Workbooks](https://docs.microsoft.com/azure/application-insights/app-insights-usage-workbooks) and Cohorts tools. Templates added to this repository will show up in the Workbooks and Cohorts tools for all users of Application Insights. By contributing templates, you can help others solve interesting problems using the workbooks and cohorts you've found helpful on your own team.

# How to contribute?
Workbook and cohort templates follow a certain folder structure.
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
The template galleries of the Workbooks and Cohorts tools are organized into categories, like Business Hypotheses, Performance, and Usage. Each category can contain many templates.
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
* **A .workbook or .cohort file.** You can create a template file from the Workbooks or Cohort tools in Application Insights in the Azure portal. See the "How to create a .workbook or .cohort file" section for more details.
* **A settings.json file.** This file describes a template with metadata. You can specify a localized version of metadata per a language folder.
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

## How to create a .workbook or .cohort file
There are three ways of creating a template. 
* Create from the default template.
* From the existing template. You can modify or enhance off of the existing template.
* From the existing report. You can modify or enhance off of the existing report.

## Create from the default template
1. Go to http://portal.azure.com 
2. Select Application Insights resource
3. Select "Workbooks"
4. Select Default Template under Quick Start section.<br/>
    ![Image of default template](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/DefaultTemplate.png)
5. Modify report as you wish and click "Advanced Editor" button from the menu. Copy all contents and create a file like "your custom template name.template". Please make sure file name ends with '.workbook'.<br/>
![Image of toolbar](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/Toolbar-AdvancedEditor.png)

## Create from an existing template
1. Go to http://portal.azure.com 
2. Select Application Insights resource
3. Select "Workbooks"
4. Select a template you are interested.<br/>
    ![Image of default template](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/Existing-Template.png)

5. Modify report as you wish and click "Advanced Editor" button from the menu. Copy all contents and create a file like "your custom template name.template". Please make sure file name ends with '.workbook'.<br/>
![Image of toolbar](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/Toolbar-AdvancedEditor.png)
	
## Create from an existing report
1. Go to http://portal.azure.com 
2. Select Application Insights resource
3. Select "Workbooks"
4. Click on Open icon from the menu.
5. Select a desired saved report you want to start with.<br/>
    ![Image of default template](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/SavedList.png)

6. Modify report as you wish and click "Advanced Editor" button from the menu. Copy all contents and create a file like "your custom template name.template". Please make sure file name ends with '.workbook'.

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

# What is Community Template Repository for?
This repository allows developers or IT professionals to create reusable template so that they can share Usage related reports with a community. We currently support Workbooks and Cohorts. 

# How to contribute?
Do contrubute it, it would be necessary to understand the structure of folders. The following is the folder structures of Community Templates.
```
Root
 |
 |- Workbooks
       |- Category A
             |- categoryResources.json
             |- Template A
                    |- en
                        |- A.template
                        |- settings.json
                    |- ko
                        |- A.template
                        |- settings.json
             |- Template B
                    |- en
                        |- B.template
                        |- settings.json
                    |- ko
                        |- B.template
                        |- settings.json
       |- Category B
             |- categoryResources.json
             |- Template C
                    |- en
                        |- C.template
                        |- settings.json
                    |- ko
                        |- C.template
                        |- settings.json
             |- Template D
                    |- en
                        |- D.template
                        |- settings.json
                    |- ko
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
Each report (Workbooks is shown above) consists of a list of categories (like Performance, Usage, Events, and etc) and each category has a list of templates. So think of category as template group as depicted below:
![Image of category view](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/CategoryView.png)

To define a category, we need to specify categoryResources.json file per the category folder. The categoryResources.json file contains localized versions of a name, and a description.  To define, please write the following format of json.
```
{
    "en": {"name":"Business Hypotheses", "description": "Long description goes here"},
    "es": {"name":"Hipótesis de negocios", "description": "Descripción larga va aquí"},
    "ko": {"name":"비즈니스 추측", "description": "설명은 여기에..."},
}
```
Each language object has the following property:
	- name
	- description
The name of language uses **ISO 639-1 CODE** *
## Template folder
A list of templates is located under a category folder and each template metadata and content is under a template folder as depicted below:
```
       |- Category A
             |- categoryResources.json
             |- Template A
                    |- icon.svg
                    |- en
                        |- A.template
                        |- settings.json
                    |- ko
                        |- A.template
                        |- settings.json
             |- Template B
                    |- icon.svg
                    |- en
                        |- B.template
                        |- settings.json
                    |- ko
                        |- B.template
                        |- settings.json
```

Each template folder contains a list of language folder and optional icon file. The name of language abbreviation and the format of it is **ISO 639-1 CODE**
The optional icon file could be any format of image like svg, png, and etc. We only support only one icon file per a template as of now.
Each language folder contains the following files:
* .template: Any file name with .template extension. You can create .template file from Azure portal. To learn how to create one, please refer to How to create .template file
* settings.json: A metadata that describes a template. You can specify a localized version of metadata per a language folder.
    ```
        {
            "name":"Improving User Retention",
            "description": "Long description goes here",
            "icon": "icon.svg",
            "tags": ["Foo", "Bar"]
        }
    ```
    * name: A localized name.
    * description: A localized description.
    * icon: Optional. If you put an empty string to "icon" property, it will use the default icon. Otherwise, specify the icon file name that is located under the template folder. 
    * tags: Optional. You can specify a list of tags that describes the template. If you don't have any tags to specify, please simply put []
## How to create .template file
There are three ways of creating a template. 
* Create from the default one.
* From the existing template. You can modify or enhance off of the existing template.
* From the existing report. You can modify or enhance off of the existing report.

Create from the default one
1. Go to http://portal.azure.com 
2. Select Application Insights resource
3. Select "Workbooks"
4. Select Default Template under Quick Start section.<br/>
    ![Image of default template](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/DefaultTemplate.png)
5. Modify report as you wish and click "Advanced Editor" button from the menu. Copy all contents and create a file like "your custom template name.template". Please make sure file name ends with '.template'.<br/>
![Image of toolbar](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/Toolbar-AdvancedEditor.png)

## Create from the existing template
1. Go to http://portal.azure.com 
2. Select Application Insights resource
3. Select "Workbooks"
4. Select a template you are interested.<br/>
    ![Image of default template](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/Existing-Template.png)

5. Modify report as you wish and click "Advanced Editor" button from the menu. Copy all contents and create a file like "your custom template name.template". Please make sure file name ends with '.template'.<br/>
![Image of toolbar](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/Toolbar-AdvancedEditor.png)
	
## To create it from the existing template
1. Go to http://portal.azure.com 
2. Select Application Insights resource
3. Select "Workbooks"
4. Click on Open icon from the menu.
5. Select a desired saved report you want to start with.<br/>
    ![Image of default template](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/_assets/SavedList.png)

6. Modify report as you wish and click "Advanced Editor" button from the menu. Copy all contents and create a file like "your custom template name.template". Please make sure file name ends with '.template'.

```
* To see complete list of language code, please refer to https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes
```

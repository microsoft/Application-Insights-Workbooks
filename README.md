
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
This repository allows developers or IT professionals to create reusable template so that they can share Usage related reports with a community. We currently support Workbooks and Cohorts templates. 

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

## PR Checklist

* [ ] Explain your changes, so people looking at the PR know *what* and *why*, the code changes are the *how*.
* [ ] post a screenshot of templates and/or gallery changes
* [ ] if adding or updating templates, ensure all steps have meaningful names
* [ ] if adding or updating templates, ensure all parameters and grid columns have display names set so they can be localized
* [ ] ensure that parameters do not have duplicate id values __or they will fail PR validation__ (parameter ids are used for localization)
* [ ] ensure that steps do not have duplicate names __or they will fail PR validation__ (step names are used for localization)
* [ ] if updating templates, grep `/subscription/` and ensure that your parameters don't have any hardcoded resourceIds __or they will fail PR validation__*
* [ ] if updating templates, remove `fallbackResourceIds` and `fromTemplateId` fields from your template workbook __or they will fail PR validation__
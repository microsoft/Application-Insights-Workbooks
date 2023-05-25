## PR Checklist

* [ ] Explain your changes, so people looking at the PR know *what* and *why*, the code changes are the *how*.
* [ ] Validate your changes using one or more of the [testing](../Documentation/Testing.md) methods.

### If adding or updating templates:
* [ ] post a screenshot of templates and/or gallery changes
* [ ] ensure your template has a corresponding gallery entry in the gallery folder
* [ ] If you are adding a new template, add your team and template/gallery file(s) to the CODEOWNERS file. CODEOWNERS entries should be teams, not individuals
* [ ] ensure all steps have meaningful names
* [ ] ensure all parameters and grid columns have display names set so they can be localized
* [ ] ensure that parameters id values are unique __or they will fail PR validation__ (parameter ids are used for localization)
* [ ] ensure that steps names are unique __or they will fail PR validation__ (step names are used for localization)
* [ ] grep `/subscription/` and ensure that your parameters don't have any hardcoded resourceIds __or they will fail PR validation__
* [ ] remove `fallbackResourceIds` and `fromTemplateId` fields from your template workbook __or they will fail PR validation__
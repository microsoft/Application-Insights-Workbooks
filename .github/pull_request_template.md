## Summary

Explain your changes, so people looking at the PR know *what* and *why*, the code changes are the *how*.

## Screenshots

- [ ] If you added a template to a gallery, show a screenshot of it in the gallery view (which verifies its shows up where you expected).

  It is also good to show a screenshot of template content, so people can see what you expect it to look like, compared to what they see when they might run it themselves.

## Validation

- [ ] Validate your changes using one or more of the [testing](https://github.com/microsoft/Application-Insights-Workbooks/blob/master/Documentation/Testing.md) methods.
  
  Make sure you've tested your template content. Fixing things while in PR is trivial. Hotfixing it later is very expensive; at the current time at least 3 teams are involved in a hotfix!

## Checklist

- [ ] If you are adding a new template, gallery, or folder, add your team and folder/file(s) to the CODEOWNERS file at the root of the repo. CODEOWNERS entries should be teams, not individuals.
      When done correctly, this means that from then on *your* team does reviews of *your* things, not the workbooks team.
- [ ] Ensure all steps in your template have meaningful names.
- [ ] Ensure all parameters and grid columns have display names set so they can be localized.

## How to contribute
We follow the [GitHub shared repository model](https://help.github.com/articles/about-collaborative-development-models).


Please note that this project is released with a [Contributor Code of Conduct][code-of-conduct]. By participating in this project you agree to abide by its terms.
- [Creating issues](#creating-issues)
- [Recommended setup for contributing](#recommended-setup-for-contributing)
- [Commit messages](#commit-messages)
- [Pull requests](#pull-requests)


## Creating issues
- You can [create an issue][new-issue], but before doing that please read the bullets below and include as many details as possible.
- Perform a [cursory search][issue-search] to see if a similar issue has already been submitted.

### Related repositories
This is the repository for Azure Monitor Workbook Templates used in the Azure Portal. Please ensure that you are opening issues in the right repository.

Other repos you might be looking for:
* [Azure Monitor Community](https://github.com/microsoft/AzureMonitorCommunity#azure-monitor-community) repo, with query, alerts, workbook samples.
* [Log Analytics Query Examples](https://github.com/MicrosoftDocs/LogAnalyticsExamples) repo - contains example log analytics queries
* [Azure Sentinel](https://github.com/azure/azure-sentinel) repo - contains queries, dashboards, templates used by Azure Sentinel

## Recommended setup for contributing
- In order to contribute, you'll need contributor access to the repo in order to push your branch and create a PR. 
    - If you are a Microsoft employee:
      1) Ensure your github user is already a member of the [Microsoft organization](https://repos.opensource.microsoft.com/orgs)
      2) Look at the `CODEOWNERS` file to find if there is already a team set up for the area you are looking to contribute.
      3) If there is an existing [Github Team in the Microsoft organization](https://github.com/orgs/microsoft/teams), ask the owners of that team to add you there if appropriate.
      4) if there is *not* an existing team, and you're looking to add workbook templates to new areas, in most cases you'll need to [create a new team in the Microsoft organization in GitHub](https://github.com/orgs/microsoft/teams).
      5) If you created a new team, or you don't fall under one of the existing teams, send mail to `azmonworkbooks` with all the relavant information, including GitHub team name and details about the area you want to contribute to, so we can direct your request to the appropriate teams.
  
    - If you are *not* a Microsoft employee, the quickest way is to [create a new issue][new-issue] and ask for contributor access.  Please include all the relevant information about what you are trying to do and why, so we can direct your request to the appropriate teams.

- To contribute your own examples, clone the repo, [create a new branch][topic-branch], make your changes or additions, and then [submit a pull request](https://help.github.com/articles/about-pull-requests/). 

- If you submit a pull request with new or significant changes, and you are not an employee of Microsoft, we'll add a comment to the pull request asking you to submit an online [CLA](https://cla.microsoft.com) (Contribution License Agreement). We'll need you to complete the online form before we can accept your pull request.

- If you are adding new folders to the top level Workbooks folder, you must also update the `CODEOWNERS` file to assign your team as owners of content in that folder. This will allow github to automatically require review from people in your team in order to update your templates.  Owners in `CODEOWNERS` should be teams, not individuals.

For details of how to contribute templates, see the [template contribution](Documentation/Contributing.md) documentation

## Commit messages
When creating commits, always try to create useful commit messages explaining what that commit contains. Avoid commit messages like "fix" or "commit". If you're fixing something that's been reported as an issue in the repo, refer to the issue number in commit messages.

## Pull Requests
When creating a pull request, please create a good title, fill the description with content, and ideally, paste a screenshot of what your template looks like when used as a workbook. Not everyone may have access to the type of data you have in your workbook, so seeing a screenshot of what is expected is often helpful, especially for complicated workbooks.

In general, the workbooks team will *not* complete or merge PRs for other teams unless explicitly told to do so.
After your pull request is approved and merged, please delete your branch.

The github pull request will verify you've signed the CLA agreement, and that your code passes a set of CI build tests.

## Build and Deployment
See [Deployment](Documentation/Deployment.md) page for details on build and deployments.

[code-of-conduct]: https://opensource.microsoft.com/codeofconduct/
[new-issue]: https://github.com/microsoft/Application-Insights-Workbooks/issues/new
[issue-search]: https://github.com/microsoft/Application-Insights-Workbooks/issues
[white-house-api-guidelines]: https://github.com/WhiteHouse/api-standards/blob/master/README.md
[topic-branch]: https://www.git-scm.com/book/en/v2/Git-Branching-Branching-Workflows#Topic-Branches

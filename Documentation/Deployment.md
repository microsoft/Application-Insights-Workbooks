# Template Build and Deployment

> Note:  The way templates are built and deployed is changing to meet Azure Safe Deploy guidelines. This document describes both the current process and the process that is coming soon. |

## Current process
1. After a PR is completed to the `master` branch, an [official build is queued](https://github-private.visualstudio.com/microsoft/_build?definitionId=48) (you might not have access to this), which packages all the templates up into a cacheable format for deployment. This build generally takes ~15 minutes.

2. After the official build completes, [a staged release deployment takes place](https://github-private.visualstudio.com/microsoft/_release?_a=releases&definitionId=1) (again, you might not have access to this), which deploys to various storage accounts and takes ~15 minutes to work its way through all the stages.  

3. After that, a service which exposes those templates detects the changes and rebuilds its web cache.

So in the usual case, after successful completion of a PR and deployment, template changes become available to portal clients in ~1 hour.

## Coming Soon: Safe Deploy process
This is changing to a process that builds the template content into an npm package, and the release pipeline will publish that npm package to our internal team packaging feed where other dependencies live. That npm package of templates will be picked up by the AppInsights extension's daily build, and deployed via the extension's daily release train.

1. After a PR is completed to the `master` branch, an [official build is queued](https://github-private.visualstudio.com/microsoft/_build?definitionId=48) (you might not have access to this), which packages all the processed templates into a versioned NPM package

2. After the official build completes, [a relase pipeline](https://github-private.visualstudio.com/microsoft/_release?_a=releases&definitionId=1) (again, you might not have access to this), uploads the built NPM package to an Azure Devops package feed.

3. Every weekday @ 3pm (pacific), a daily build of the Application Insights Azure Portal extension takes place. This build consumes the NPM package from the ADO package feed.

4. Every weekday @ ~4pm (pacific), a daily deployment deploys the extension to a pre-production environment (PPE)

5. Every weekday @ ~noon (pacific), the previous day's build moves up a stage, from PPE to another internal environment (MPAC), and other non-public cloud test environments.

6. Every weekday @ ~noon (pacific), the previous previous day's build moves up a stage and starts a rolling deployment to production Azure environments, including other non-public clouds.

In the usual case, this means that template changes will not show up in Production Azure for at least 48 hours.

### Hotfixes
If a hotfix is required to get changes out faster than that, you'll need to work with the Workbooks team to gather the required information to justify a hotfix.  Start by [create an issue][new-issue], and someone from the workbooks team will work with you.

[new-issue]: https://github.com/microsoft/Application-Insights-Workbooks/issues/new

# Template Build and Deployment

## Template deployment via Safe Deploy process
Once content is checked into master, the template content is packaged into an npm package, and the release pipeline will publish that npm package to our internal team packaging feed where other dependencies live. That npm package of templates will be picked up by the AppInsights extension's daily build, and deployed via the extension's daily release train.

1. An [official build is queued](https://github-private.visualstudio.com/microsoft/_build?definitionId=474) (you might not have access to this) @ noon (pacific) daily which packages all the processed templates into a versioned NPM package.

2. After the official build completes, [a release pipeline](https://github-private.visualstudio.com/microsoft/_release?_a=releases&view=mine&definitionId=65) (again, you might not have access to this), uploads the built NPM package to an Azure Devops package feed.

3. Every weekday @ 3pm (pacific), a daily build of the Application Insights Azure Portal extension takes place. This build consumes the NPM package from the ADO package feed.

4. Every weekday @ ~4pm (pacific), [a daily deployment of the AppInsightsExtension occcurs](https://eng.ms/docs/cloud-ai-platform/azure/aep-platform-infrastructure/observability/application-insights/portal/operations/deployment#deployment-pipeline), which deploys the extension to a pre-production environment ([PPE](https://portal.azure.com/?feature.canmodifystamps=true&appInsightsExtension=ppe))

5. Every weekday @ ~noon (pacific), the previous day's build moves up a stage, from PPE to another internal environment ([MPAC](https://portal.azure.com/?feature.canmodifystamps=true&appInsightsExtension=mpac)), and other non-public cloud test environments.

6. Every weekday @ ~noon (pacific), the previous previous day's build moves up a stage and starts a rolling deployment to production Azure environments, including other non-public clouds. The production rollouts take several hours as they deploy region by region.

In the usual case, this means that template changes will not show up in Production Azure for at least 48 hours.

### Hotfixes
If a hotfix is required to get changes out faster than that, you'll need to work with the Workbooks team to gather the required information to justify a hotfix. Start by [create an issue][new-issue], and someone from the workbooks team will work with you. If possible, use your internal telemetry to figure out how many people/subscriptions are affected by the issue you need to hotfix, etc, as leadership will ask those details when we want to hotfix. If there are ICM incidents, etc, include that information in your issue. 

[new-issue]: https://github.com/microsoft/Application-Insights-Workbooks/issues/new

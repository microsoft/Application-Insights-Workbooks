# Template Build and Deployment

## Template deployment via Azure SafeDeploy, Managed SDP

Once content is checked into master, it will be picked up during the next scheduled template package build. That build publishes the npm package to our internal team packaging feed where other dependencies live. That npm package of templates will be picked up by the AppInsights and Workbooks extension's scheduled builds, and deployed via each extension's Managed SDP (Safe Deploy) release train.

* An [official build of the template package is queued](https://msazure.visualstudio.com/One/_build?definitionId=299360) @ noon PST/1pm PDT daily, which picks up updated templates from the repo, merges in localized content, and packages all the processed templates, into a versioned NPM package and uploads the NPM package to an Azure Devops package feed.

### Application Insights extension deployment

The template content is packaged and deployed inside the Application Insights Extension, Where the majority of workbook/template related Views currently are built.

The Application Insights extension deploys using **Managed SDP** and **Azure SafeDeploy** rules. Full rollout to all production regions takes approximately **8 days**.

* Every weekday, a daily build of the Application Insights Azure Portal extension takes place. This build consumes the NPM package from the ADO package feed.

* The extension is deployed via the [App Insights extension deployment process](https://eng.ms/docs/cloud-ai-platform/azure/aep-platform-infrastructure/observability/application-insights/portal/operations/deployment#deployment-pipeline) following Azure SafeDeploy rules, progressing through stages including:

  * **PPE** (pre-production): [PPE](https://portal.azure.com/?feature.canmodifystamps=true&appInsightsExtension=ppe)
  * **StagePreview** (internal): [MPAC](https://portal.azure.com/?feature.canmodifystamps=true&appInsightsExtension=stagepreview) and other non-public cloud test environments
  * **Production**: Rolling deployment to production Azure environments ring by ring, then the other Azure clouds.

* Due to Managed SDP and Azure SafeDeploy staging rules, full rollout to all production regions takes approximately **8 days** from the initial deployment to reach all production rings of the azure portal.

### Workbooks extension deployment

Newer Workbooks views, supporting at-scale Insights views and Workbooks and  Dashboard preview views use the same template package, but are deployed via the [Workbooks Azure Portal extension deployment process](https://eng.ms/docs/cloud-ai-platform/azure-edge-platform-aep/aep-health-standards/observability/workbooks-experiences/workbooks-docs/operations/standarddeployment), which follows a similar Managed SDP (Safe Deploy) process but with less frequent releases.

* The Workbooks extension builds and releases on **Monday and Wednesday**.
* Deployment follows the same Managed SDP and Azure SafeDeploy staging rules as the Application Insights extension.

  * **ReleaseValidation** (pre-production): [PPE](https://portal.azure.com/?feature.canmodifystamps=true&Microsoft_Azure_WorkbooksExtension=releaseValidation)
  * **StagePreview** (internal): [MPAC](https://portal.azure.com/?feature.canmodifystamps=true&Microsoft_Azure_WorkbooksExtension=stagepreview) and other non-public cloud test environments
  * **Production**: Rolling deployment to production Azure environments ring by ring, then the other Azure clouds.

* Due to Managed SDP and Azure SafeDeploy staging rules, full rollout to all production regions takes approximately **8 days** from the initial deployment to reach all production rings of the azure portal.

## Hotfixes

If a hotfix is required to get changes out faster than that, you'll need to work with the Workbooks team to gather the required information to justify a hotfix. Start by creating an ICM ticket against Workbooks & Experiences team, and someone from the workbooks team will work with you.

> **_NOTE:_** Please create the ICM ticket as **Severity 3** unless the issue matches the following Severity 2 definition according to the [OCEN](https://aka.ms/ocen) guideline: Major scenarios are impacted for more than 10% users.

If possible, use your internal telemetry to figure out how many people/subscriptions are affected by the issue you need to hotfix, etc, as leadership will ask those details when we want to hotfix. If there are related ICM incidents, etc, include that information in your ticket.

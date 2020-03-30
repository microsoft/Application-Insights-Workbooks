# View Designer to Workbooks Transition Guide

## Table of Contents
- Overview
- [Conversion Options](./ConversionOptions.md)
- [Accessing & Managing Views](./AccessPermissions.md)
- [Common Steps](./CommonSteps.md)
- [Tile Conversions](./TileConversions.md)

## Why Convert View Designer Dashboards to Workbooks?

View Designer offers the ability to generate different query-based views and visualizations. However, many high-level customizations remain limited, such as formatting the grids and tile layouts or selecting alternative graphics to represent your data. View Designer is restricted to a total of 9 distinct tiles to represent your data.

Workbooks is a platform that unlocks the full potential of your data. Workbooks not only retains all the capabilities, but also supports additional functionality through text, metrics, parameters, and much more. For example, Workbooks allows users to consolidate dense grids and add search bars to easily filter and analyze the data.


### Advantages of using Workbooks over View Designer

* Supports both logs AND metrics
* Allows both personal views for individual access control and shared Workbooks views
* Custom layout options with tabs, sizing, and scaling controls
* Support for querying across multiple workspaces, Application Insights applications, and subscriptions
* Enables custom parameters that dynamically update associated charts and visualizations
* Template gallery support from public GitHub

<img src = "./Examples/WorkbookViews.png" height = 66%; width =66%>

## View Designer Overview
View Designer is a tool offered through Azure Monitor. View Designer allows you to create custom views to help you visualize data in your Log Analytics workspace, with charts, lists, and timelines. 

Link to additional [View Designer Resources](https://docs.microsoft.com/azure/azure-monitor/platform/view-designer)

## Workbooks Overview
Workbooks combine text, [log queries](https://docs.microsoft.com/azure/azure-monitor/log-query/query-language), metrics, and parameters into rich interactive reports. Team members with the same access to Azure resources are also able to edit Workbooks.

Workbooks are helpful for scenarios such as:

- 	Exploring the usage of your virtual machine when you don't know the metrics of interest in advance: CPU utilization, disk space, memory, network dependencies, etc. Unlike other usage analytics tools, workbooks let you combine multiple kinds of visualizations and analyses, making them great for this kind of free-form exploration.
-	Explaining to your team how a recently provisioned VM is performing, by showing metrics for key counters and other log events.
-	Sharing the results of a resizing experiment of your VM with other members of your team. You can explain the goals for the experiment with text, then show each usage metric and analytics queries used to evaluate the experiment, along with clear call-outs for whether each metric was above- or below-target.
-	Reporting the impact of an outage on the usage of your VM, combining data, text explanation, and a discussion of next steps to prevent outages in the future.

Link to additional [Workbook Resources](https://docs.microsoft.com/azure/azure-monitor/insights/vminsights-workbooks)

While this guide offers simple steps to directly recreate several of the commonly used View Designer views, Workbooks allows users to have the freedom to create and design any of their own custom visualizations and metrics. Below is a snapshot of what Workbooks is capable of creating:

[Workspace usage template from Workbooks](https://go.microsoft.com/fwlink/?linkid=874159&resourceId=Azure%20Monitor&featureName=Workbooks&itemId=community-Workbooks%2FAzure%20Monitor%20-%20Workspaces%2FWorkspace%20Usage&workbookTemplateName=Workspace%20Usage&func=NavigateToPortalFeature&type=workbook)
![Example of Workbooks Application](./Examples/WBTemplateEX.jpg)



### [Next Section: Conversion Options](./ConversionOptions.md)

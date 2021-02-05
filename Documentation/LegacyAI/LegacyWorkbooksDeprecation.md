# Application Insights Workbooks Deprecation
For historical reasons, Application Insights Workbooks ("Legacy Workbooks") are stored as a different Azure resource type than all other Azure Workbooks.
Specifically, Legacy Workbooks are a resource type `microsoft.insights/components/favorites`, a nested "proxy" resource type that does not support all Azure Resource Manager (ARM) features, while Azure Workbooks are resource type `microsoft.insights/workbooks`, visible as a top level resource type in the Azure portal.

Because of this difference, Legacy Workbooks is missing features that are available for standard Azure Workbooks in other places:
* Legacy Workbooks can not be queried via Azure Resource Graph (ARG)
* Legacy Workbooks do not support top level ARM features like other resource types, including but not limited to
    * Tags
    * Activity Log / Change Tracking
    * Resource locks
* Legacy Workbooks do not support [ARM templates](../Programmatically.md) like the other workbook types
* Legacy Workbooks do not support "Bring your own storage" [(BYOS)](../BYOS/BringYourOwnStorage.md) feature of Azure Workbooks
* Legacy Workbooks are restricted to being saved to the same region as the Application Insights resource.
* Legacy Workbooks will not support upcoming features planned for Azure Workbooks.

Moving Application Insights to use standard Azure Workbooks will allow it to take advantage of all the existing and new functionality available to other resources that are using Workbooks.

Existing Legacy Workbooks will be available in the Azure Portal until July 1, 2021.

Note: this will *not* change where you go to find Workbooks in Application Insights. You'll still see that menu item, workbooks will continue to be available for Application Insights, only the details of where exactly your workbook content is *saved* is changing.

# How should you proceed?

Until the sunset date, the Workbooks feature in Application Insights will show both Legacy Workbooks and Azure workbooks in places like the gallery.

* You'll be able to edit existing Legacy Workbooks as normal for some period of time.
* Any newly saved workbooks will be standard Azure Workbooks.
* 'Save as' will create standard Azure Workbooks
* Save of *existing* legacy workbooks will continue to update the Legacy Workbook
* At a future date, workbooks will no longer allow in place save of Legacy workbooks.

For any legacy workbook you want to keep after July 1, you'll need to use "Save as" to save the workbook as a full Azure Workbook. This will require you to select a subscription, resource group, and region where you have write access. 
* If the Legacy Workbook uses links to other Legacy Workbooks, or loading workbook content in groups, those items will need to be updated to point to the newly saved workbooks.
* After using save as, you can delete the Legacy Workbook

After the sunset date in the Azure Portal, users will still be able to retrieve the content of Legacy Workbooks for some period of time by using Azure CLI or powershell tools, to query `microsoft.insights/components/[name]/favorites` for the specific resource using `api-version=2015-05-01`.

# How do I know if my workbook is legacy or not?
![Legacy vs Azure Workbook](../Images/PrivateVsSharedWB.png)

One of the easiest ways is to identify a legacy workbook is by the icon on the gallery view. Legacy workbooks will show a warning icon, Azure workbooks will not show a warning icon. 

Opening of Legacy Workbooks will also show a banner, opening standard Azure Workbooks will not.

# Why isnt' there an automatic migration?

1) The write permissions for legacy workbooks are only based on Azure role based access control on the Application Insights resource itself. A user may not be allowed to creating workbooks in the same resource group, so if they were auto migrated, they could fail to be moved, OR they could be created but then a user might not be able to delete them after the fact.

2) Legacy workbooks support "My" (private) workbooks, which has been phased out of Azure Workbooks. A migration would cause those private  workbooks to become publicly visible to users with read access to that same resource group.

3) Usage of links/group content loaded from saved Legacy workbooks would become broken.  Authors will need to manually update these links to point to the new saved items.

For these reasons, we suggest that users manually migrate the workbooks they want to keep.
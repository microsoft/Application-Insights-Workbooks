# Private Workbooks Deprecation
Private Workbooks are stored as a different Azure resource type than Shared Workbooks. We are merging these different Azure resource types and making one single standard type. This will allow it to take advantage of all the existing and new functionality available in Azure Workbooks. For example,  

* Converted Private Workbooks can be queried via Azure Resource Graph (ARG) 
* Converted Private Workbooks can support top level ARM features like other resource types, including but not limited to 
    * Tags 
    * Activity Log / Change Tracking 
    * Resource locks 
* Converted Private Workbooks can support ARM templates  
* Converted Private Workbooks can support "Bring your own storage" (BYOS) feature 
* Converted Private Workbooks can be saved in region of your choice 

# How does this impact me?
Private workbooks will be availbable in the Azure Portal until **June 30, 2021.**

To continue using your Private Workbooks after June 30, 2021 **you will need to create a copy** before June 30, 2021 by using 'Save' or 'Save As' to make them Shared Workbooks. This will require you to select a subscription, resource group, and region where you have write access. 

This will not change where you find your workbook or the content of your workbook. Any new workbooks you create hereafter will be Shared Workbooks.   

### Things to remember  
1. You'll be able to update (edit and save) existing Private Workbooks until June 30, 2021 as is After June 30, 2021, it will not be possible to save Private workbook and you will need to "save" or "save as"
2. Any new workbook you create will be Shared workbook.   
3. If you attempt to save a private workbook, you will instead be prompted to save it as a new shared workbook
4. 'Save as' on Private Workbook will create Shared Workbook 

# How should you proceed?
### Identify Private Workbooks

One of the easiest ways is to identify a private workbook and shared workbook by their icon on the gallery view. The private workbook will have a blue icon with a person figure in the corner. The shared workbook is a similar blue icon without a person figure.

![Private vs Shared Workbook](../Images/PrivateVsSharedWB.png)

### Convert Private Workbooks to Shared workbooks
If you choose to migrate your private workbook to a shared one, you can move it to a shared workbook using one of the following methods:
- Save (shows UI and save as shared workbook)
- Save As (defaults to shared workbook)
- Move Workbook
- Copy Link > "Move to Shared Reports"

If you don't want others to have access to your workbook, you can manually change the RBAC to deny access to others.

### Managing Test Workbook Clutter
The simplest way to keep things separate is to save test workbooks to other subscriptions or resource groups. An upcoming change to the workbook gallery will make it easier to filter to specific resource groups to filter to specific resource groups.

There are existing documents about workbook Access control here:
https://docs.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-access-control

There are no changes to the behaviors of roles, or access control with these changes.

# What happens if I don't Convert
From June 30, 2021, you will not see your private workbooks in Azure Portal. You will be able to retrieve the content of the private workbooks for a month until July 30. 
# Private Workbooks Deprecation
Private workbooks will be deprecated by June 30 2021. Do 'Save' or 'Save As' to make them Shared Workbooks and continue to use after June 30 2021. Removing private workbooks simplifies a lot of confusing experiences and support issues that customers are having with private workbooks compared to full Azure Resource based Workbooks.

# How should you proceed?
If you choose to migrate your private workbook to a shared one, you can move it to a shared workbook using one of the following methods:
- Save (shows UI and save as shared workbook)
- Save As (defaults to shared workbook)
- Move Workbook
- Copy Link > "Move to Shared Reports"

If you don't want others to have access to your workbook, you can manually change the RBAC to deny access to others.

# How do I know if my workbook is private or not?
One of the easiest ways is to identify a private workbook and shared workbook by their icon on the gallery view. The private workbook will have a blue icon with a person figure in the corner. The shared workbook is a similar blue icon without a person figure.
![Private vs Shared Workbook](../Images/PrivateVsSharedWB.png)

# But my Test Workbooks Clutter the Shared Space!
The simplest way to keep things separate is to save test workbooks to other subscriptions or resource groups. An upcoming change to the workbook gallery will make it easier to filter to specific resource groups to filter to specific resource groups.

There are existing documents about workbook Access control here:
https://docs.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-access-control

There are no changes to the behaviors of roles, or access control with these changes.

# What happens if I don't Convert
From June 30, 2021, you will not see your private workbooks in Azure Portal. You will be able to retrieve the content of the private workbooks for a month until July 30. 
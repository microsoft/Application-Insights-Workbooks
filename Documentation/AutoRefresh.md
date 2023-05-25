> [!NOTE] 
> This documentation for Azure workbooks is now located at: https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-getting-started#auto-refresh
> Please **do not** edit this file. All up-to-date information is in the new location and documentation should only be updated there.

## Auto-Refresh Workbooks
Clicking on Auto-Refresh button opens a list of intervals to let the user pick up the interval. The Workbook will keep refreshing after the selected time interval. 
* Auto-Refresh only refreshes when the Workbook is in read mode. If a user sets an interval of say 5 minutes and after 4 minutes switches to edit mode then there is no refreshing when the user is still in edit mode. But if the user comes back to read mode, the interval of 5 minutes resets and the Workbook will be refreshed after 5 minutes. 
* Clicking on the Refresh button on Read mode also reset the interval. Say a user sets the interval to 5 minutes and after 3 minutes, the user clicks on the refresh button to manually refresh the Workbook, then the Auto-refresh interval resets and the Workbook will be auto refreshed after 5 minutes. 
* This setting is not saved with Workbook. Every time a user opens a Workbook, the Auto-refresh is Off initially and needs to be set again.
* Switching Workbooks, going out of gallery will clear the Auto refresh interval.



![Auto refresh](./Images/AutoRefresh.PNG)

![Auto refresh with interval set](./Images/AutoRefreshWithIntervalSet.PNG)
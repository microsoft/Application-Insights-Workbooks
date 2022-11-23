> [!NOTE] 
> This documentation for Azure workbooks is now located at: https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-limits
> Please **do not** edit this file. All up-to-date information is in the new location and documentation should only be updated there.

# Limits


## Data Source Limits

### General
* In general, Workbooks limits the results of queries to be no more than 10,000 results. Any results after that point are truncated.
* Each data source may have its own specific limits based on the limits of the service they query.
* Those limits may be on the numbers of resources, regions, results returned, time ranges.  Consult the documentation for each service to find those limits.

### Log based Queries (Log Analytics, Application Insights, resource centric queries)
* Log Analytics [has limits](https://docs.microsoft.com/en-us/azure/azure-monitor/service-limits#log-queries-and-language) for the number of resources, workspaces, and regions involved in queries.

### Metrics
* Metrics grids are limited to querying 200 resources at a time.

### Azure Resource Graph
* Resource Graph queries [are limited](https://docs.microsoft.com/en-us/azure/governance/resource-graph/troubleshoot/general#toomanysubscription) to 1000 subscriptions at a time.

## Visualizations

### Grid
* By default, grids only display the first 250 rows of data. This setting can be changed in the query step's advanced settings to display up to 10,000 rows. Any further items will be ignored, and a warning will be displayed.

### Charts
* Charts are limited to 100 series.
* Charts are limited to 10000 data points.

### Tiles
* Tiles is limited to displaying 100 tiles. Any further items will be ignored, and a warning will be displayed.

### Maps
* Maps are limited to displaying 100 points. Any further items will be ignored, and a warning will be displayed.

### Text
* Text visualization only displays the first cell of data returned by a query. Any other data is ignored.

## Parameters

### Drop Down
* Drop down based parameters are limited to 1000 items. Any items after that returned by a query are ignored.
* When based on a query, only the [first 4 columns](../Parameters/DropDown.md#parameter-value-label-selection-and-group) of data produced by the query are used, any other columns are ignored. 

### Multi-value 
* Multi-value parameters are limited to 100 items. Any items after that returned by a query are ignored.
* When based on a query, only the first column of data produced by the query is used, any other columns are ignored.

### Options Group
* Options group parameters are limited to 1000 items. Any items after that returned by a query are ignored.
* When based on a query, only the first column of data produced by the query is used, any other columns are ignored.

### Text
* Text parameters that retrieve their value based on a query will only display the first cell returned by the query (row 1, column 1). Any other data is ignored.

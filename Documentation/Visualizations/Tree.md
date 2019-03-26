# Tree Visualization

Workbooks support hierarchical views via tree-grids. Trees allow some rows to be expandable into the next level for a drill-down experience.

The example below shows container health metrics (working set size) visualized as a tree grid. The top-level nodes here are Azure Kubernetes Service (AKS) nodes, the next level are pods and the final level are containers. Notice that you can still format your columns like in a grid (heatmap, icons, link). The underlying data source in this case is an LA workspace with AKS logs. 

![Image showing a tile visualization in workbooks](../Images/TreeExample.png)

## Adding a Tree Grid
1. Switch the workbook to edit mode by clicking on the _Edit_ toolbar item.
2. Use the _Add query_ link to add a log query control to the workbook. 
3. Select the query type as _Log_, resource type (e.g. Application Insights) and the resources to target.
4. Use the Query editor to enter the KQL for your analysis
    ```
    requests
    | summarize Requests = count() by ParentId = appName, Id = name
    | extend Kind = 'Request', Name = strcat('🌐 ', Id)
    | union (requests
    | summarize Requests = count() by Id = appName
    | extend Kind = 'Request', ParentId = '', Name = strcat('📱 ', Id))
    | project Name, Kind, Requests, Id, ParentId
    | order by Requests desc
    ```
5. Set the visualization to _Grid_
6. Click the _Column Settings_ button to open the settings pane
7. In the _Tree/Group By Settings_ section at the bottom, set:
    1. Tree Type: `Parent/Child`
    2. Id Field: `Id`
    3. Parent Id Field: `ParentId`
    4. Show the expander on: `Name`
    5. Expand the top level of the tree: `checked`
8. In _Columns_ section at the top, set:
    1. _Id_ - Column Renderer: `Hidden`
    1. _Parent Id_ - Column Renderer: `Hidden`
    3. _Requests_ - Column Renderer: `Bar`, Color: `Blue`, Minimum Value: `0`
9. Click the _Save and Close_ button at the bottom of the pane.

![Image showing the creation of a tree visualization in workbooks](../Images/Tree-Create.png)

This is how the tree will look like in read mode:

![Image showing the creation of a tree visualization in workbooks](../Images/Tree-ReadMode.png)

### Tree Settings
| Setting | Explanation |
|:------------- |:-------------|
| `Id Field` | The unique Id of every row in the grid |
| `Parent Id Field` | The id of the parent of the current row |
| `Show the expander on` | The column on which to show the tree expander. It is common for tree grids to hide their id and parent id field because they are not very readable. Instead, the expander appears on a field with a more readable value - like the name of the entity |
| `Expand the top level of the tree` | If checked, the tree grid will be expanded at the top level. Useful if you want to show more information by default |

## Grouping in a Grid
Grouping allows you to build hierarchical views similar to the ones above with significantly simpler queries. You do lose aggregation at the inner nodes of the tree, but that may be alright for some scenarios. Use _Group By_ to build tree views when the underlying result set cannot be transformed into a proper tree form - e.g. in the case of alert, health and metric data. If you data source is from KQL, then you should choose to build tree views as described above.

## Adding a Tree using Grouping
1. Switch the workbook to edit mode by clicking on the _Edit_ toolbar item.
2. Use the _Add query_ link to add a log query control to the workbook. 
3. Select the query type as _Log_, resource type (e.g. Application Insights) and the resources to target.
4. Use the Query editor to enter the KQL for your analysis
    ```
    requests
    | summarize Requests = count() by App = appName, RequestName = name
    | order by Requests desc
    ```
5. Set the visualization to _Grid_
6. Click the _Column Settings_ button to open the settings pane
7. In the _Tree/Group By Settings_ section at the bottom, set:
    1. Tree Type: `Group By`
    2. Group By: `App`
    3. Then By: `None`
    4. Expand the top level of the tree: `checked`
8. In _Columns_ section at the top, set:
    1. _App_ - Column Renderer: `Hidden`
    2. _Requests_ - Column Renderer: `Bar`, Color: `Blue`, Minimum Value: `0`
9. Click the _Save and Close_ button at the bottom of the pane.

![Image showing the creation of a tree visualization in workbooks](../Images/Tree-Group-Create.png)

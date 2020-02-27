# Interactive Workbooks

Workbooks allow authors to create interactive reports and experiences for their consumers. Interactivity is supported in a number of ways.

## Parameter Changes
When a workbook user updates a parameter, any control that uses the parameter automatically refreshes and redraws to reflect the new state. This is how a lot of Azure portal reports support interactivity. Workbooks provides this in a very straight forward manner with minimal user effort.

Learn more about [Parameters in Workbooks](Parameters/Parameters.md)

## Grid, Tile, Chart selections
Workbooks allow authors to construct scenarios where clicking a row in a grid, or tiles, or charts updates subsequent items on the content of the selected items.

For instance, a user can have a grid that shows a list of requests and some stats like failure counts. They could set it up such that clicking a row corresponding to a request, will result in detailed charts below updating to filter down to just that request.

### Setting up interactivity on grid or chart selections
1. Switch the workbook to edit mode by clicking on the _Edit_ toolbar item.
2. Use the _Add query_ link to add a log query control to the workbook. 
3. Select the query type as _Log_, resource type (e.g. Application Insights) and the resources to target.
4. Use the Query editor to enter the KQL for your analysis
    ```
    requests
    | summarize AllRequests = count(), FailedRequests = countif(success == false) by Request = name
    | order by AllRequests desc    
    ```
5. `Run query` to see the results
6. Click on the _Advanced Settings_ tab to see the advanced settings pane 
7. Check the setting: `When an items are selected, export parameters`
8. Click "Add Parameter".  in the popup that appears, enter:
    1. Field to export: `Request`
    2. Parameter name: `SelectedRequest`
    3. Default value: `All requests`
    
    ![Image showing the advanced editor with settings for exporting fields as parameters](Images/Interactivity-AdvancedSettings.png)

8. Click save
8. Click `Done Editing`.
9. Add another query control using steps 2 and 3.
10. Use the Query editor to enter the KQL for your analysis
    ```
    requests
    | where name == '{SelectedRequest}' or 'All Requests' == '{SelectedRequest}'
    | summarize ['{SelectedRequest}'] = count() by bin(timestamp, 1h)
    ```
11. `Run query` to see the results.
12. Change _Visualization_ to `Area chart`
12. Click on a row in the first grid. Note how the area chart below filters to the selected request.

The resulting reports looks like this in edit mode:

![Image showing the creation an interactive experience using grid row clicks](Images/Interactivity-GridClick-Create.png)

The image below shows a more elaborate interactive report in read mode based on the same principles. The report uses grid clicks to export parameters - which in turn is used in two charts and a text block.

![Image showing the creation an interactive experience using grid row clicks](Images/Interactivity-GridClick-ReadMode.png)

### Exporting the contents of an entire row
It is sometimes desirable to export the entire contents of the selected row instead of just a particular column. In such cases, leave the `Field to export` property unset in step 7.1 above. Workbooks will export the entire row contents as a json to the parameter. 

On the referencing KQL control, use the `todynamic` function to parse the json and access the individual columns.

 ## Grid Cell Clicks
Workbooks allow authors to add interactivity via a special kind of grid column renderer called a `link renderer`. A link renderer converts a grid cell into a hyperlink based on the contents of the cell. Workbooks support many kinds of link renderers - including ones that allow opening resource overview blades, property bag viewers, App Insights search, usage, transaction tracing, etc.

### Setting up interactivity using grid cell clicks
1. Switch the workbook to edit mode by clicking on the _Edit_ toolbar item.
2. Use the _Add query_ link to add a log query control to the workbook. 
3. Select the query type as _Log_, resource type (e.g. Application Insights) and the resources to target.
4. Use the Query editor to enter the KQL for your analysis
    ```
    requests
    | summarize Count = count(), Sample = any(pack_all()) by Request = name
    | order by Count desc
    ```
5. `Run query` to see the results
6. Click _Column Settings_ to open the settings pane.
7. In the _Columns_ section, set:
    1. _Sample_ - Column Renderer: `Link`, View to open: `Cell Details`, Link Label: `Sample`
    2. _Count_ - Column Renderer: `Bar`, Color palette: `Blue`, Minimum value: `0`
    3. _Request_ - Column Renderer: `Automatic`
    4. Click _Save and Close_ to apply changes
8. Click on one of the `Sample` link in the grid. This opens up a property pane with the details of a sampled request.

![Image showing the creation an interactive experience using grid cell clicks](Images/Interactivity-GridCellClick-Create.png)

### Link Renderer Actions
| Link action | Action on click |
|:------------- |:-------------|
| `Generic Details` | Shows the row values in a property grid context blade |
| `Cell Details` | Shows the cell value in a property grid context blade. Useful when the cell contains a dynamic type with information (e.g. json with request properties like location, role instance, etc.). |
| `Custom Event Details` | Opens the Application Insights search details with the custom event id (itemId) in the cell |
| `* Details` | Similar to Custom Event Details, except for dependencies, exceptions, page views, requests and traces. |
| `Custom Event User Flows` | Opens the Application Insights User Flows experience pivoted on the custom event name in the cell |
| `* User Flows` | Similar to Custom Event User Flows except for exceptions, page views and requests |
| `User Timeline` | Opens the user timeline with the user id (user_Id) in the cell |
| `Session Timeline` | Opens the Application Insights search experience for the value in the cell (e.g. search for text 'abc' where abc is the value in the cell) |
| `Resource overview` | Open the resource's overview in the portal based on the resource id value in the cell |

## Conditional Visibility
Workbook allows users to make certain controls appear or disappear based on values of a parameters. This allows authors to have reports look different based on user input or telemetry state. An example is showing consumers just a summary when things are good but show full details when something is wrong.

### Setting up interactivity using conditional visibility
1. Follow the steps in the `Setting up interactivity on grid row click` section to setup two interactive controls.
2. Add a new parameter at the top:
    1. Name: `ShowDetails`
    2. Parameter type: `Drop down`
    3. Required: `checked`
    4. Get data from: `JSON`
    5. JSON Input: `["Yes", "No"]`
    6. Save to commit changes.
3. Set parameter value to `Yes`
4. In the query control with the area chart, click the _Advanced Settings_ tab
5. Check the setting `Make this item conditionally visible`, and select "Add Condition".
    1. Set the settings to `ShowDetails` for the parameter name,  `equals` for the comparison, and `Yes` for parameter value
    ![image showing conditional visiblity settings](Images/ConditionalVisibility.png)
    2. click Save to add the condition
6. Click _Done Editing_ to commit changes.
7. Click _Done Editing_ on the workbook tool bar to enter read mode.
8. Switch the value of parameter `ShowDetails` to `No`. Notice that the chart below disappears.

The image below shows the visible case where `ShowDetails` is `Yes`

![Image showing the conditional visibility where the chart is visible](Images/Interactivity-ConditionalVisibility-Visible.png)

The image below shows the hidden case where `ShowDetails` is `No`

![Image showing the conditional visibility where the chart is hidden](Images/Interactivity-ConditionalVisibility-Invisible.png)

# Interactivity with multiple selections in grids and charts
Query and Metrics steps can also export one or more parameters when a row (or multiple rows) are selected.

![Image showing the export parameters settings](Images/Interactivity-ExportParameters.png)

For example, in a query step displaying a grid, go to the advanced settings, and 
1. check the `When items are selected, export parameters` checkbox.  Additional controls will appear.
2. if desired, check the "allow selection of multiple values" checkbox.  
    - If checked, the displayed visualization will allow multi-select, and exported parameter's values will be arrays of values, like when using multi-select dropdown parameters.
    - if unchecked, the displayed visualization will only respect the last selected item, only exporting a single value at a time
3. for each parameter you wish to export, use the `+ Add Parameter` button. A popup window will appear, containing the settings for the parameter to be exported.

single-selection | multi-selection
--|--
![Image showing the single-selection parameters settings](Images/Interactivity-ExportSingleParameter.png)|![Image showing the multi-selection parameters settings](Images/Interactivity-ExportMultipleParameter.png)
when single selection is enabled, the author can specify which field of the original data to export, as what parameter name, the parameter type, and the default value to use if nothing is selected (optional) | When multi-selection is enabled, the author specifies which field of the original data to export, as what parameter name, the parameter type, and the quote/delimiter values used when turning the array values into text when being replaced in a query.  In multi-select, the default value is an empty array if no values are selected.

**Note:** you can leave the `Field to export` setting empty in the export settings. If you do, all available fields in the data will be exported as a stringified JSON object of key:value pairs. For grids and tiles, this will be all of the fields in the grid. For charts, the available fields will be `x`, `y`, `series`, `label` (depending on the type of chart).

**Note:** While the default behavior is to export a parameter as text, if you know that the field is a subscription or resource id, use that as the export parameter type.  This will allow the parameter to be used downstream in places that require those types of parameters.

**Note:** For multi-select, only unique values will be exported, you will not see output array values like "1, 1, 2, 1", you'd get "1, 2" as the output values.

## Example
Given the exported parameters shown above, and a markdown step with parameters in the text, you can create a view like this:
![Image showing the multi-selection grid](Images/Interactivity-MultipleSelectGrid.png)

As rows are selected in the grid or other visualization, the parameters will be updated below.  



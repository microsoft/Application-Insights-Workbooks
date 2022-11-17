> [!NOTE] 
> This documentation for Azure workbooks is now located at: https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-dropdowns
> Please **do not** edit this file. All up-to-date information is in the new location and documentation should only be updated there.

# Drop Down Parameters

Drop downs allow user to collect one or more input values from a known set (e.g. select one of your app’s requests). Drop downs provide user-friendly way to collect arbitrary inputs from users. Drop downs are especially useful in enabling filtering in your interactive reports. 

The easiest way to specify the list by providing a static list in the parameter setting. A more interesting way is to get the list dynamically via a KQL query. Parameter setting also allow you to specify whether it is single or multi-select, and if it is multi-select, how the result set should be formatted (delimiter, quotation, etc.).

## Creating a static drop down parameter
1. Start with an empty workbook in edit mode.
2. Choose _Add parameters_ from the links within the workbook.
3. Click on the blue _Add Parameter_ button.
4. In the new parameter pane that pops up enter:
    1. Parameter name: `Environment`
    2. Parameter type: `Drop down`
    3. Required: `checked`
    4. Allow multiple selection: `unchecked`
    5. Get data from: `JSON`
5. In the JSON Input text block, insert this json snippet:
    ```json
    [
        { "value":"dev", "label":"Development" },
        { "value":"ppe", "label":"Pre-production" },
        { "value":"prod", "label":"Production", "selected":true }
    ]
    ```
6. Use the blue `Update` button.
7. Choose 'Save' from the toolbar to create the parameter.
8. The Environment parameter will be a drop down with the three values.

   ![Image showing the creation of a static drown down](../Images/Parameters-Dropdown-Create.png)

## Creating a static dropdown with groups of items
If your query result/json contains an "group" field, the dropdown will display groups of values. Follow the above sample, but use the following json instead:
```json
[
    { "value":"dev", "label":"Development", "group":"Development" },
    { "value":"dev-cloud", "label":"Development (Cloud)", "group":"Development" },
    { "value":"ppe", "label":"Pre-production", "group":"Test" },
    { "value":"ppe-test", "label":"Pre-production (Test)", "group":"Test" },
    { "value":"prod1", "label":"Prod 1", "selected":true, "group":"Production" },
    { "value":"prod2", "label":"Prod 2", "group":"Production" }
]
```
![Image showing an example of a grouped dropdown](../Images/Grouped-DropDown.png)


## Creating a dynamic drop down parameter
1. Start with an empty workbook in edit mode.
2. Choose _Add parameters_ from the links within the workbook.
3. Click on the blue _Add Parameter_ button.
4. In the new parameter pane that pops up enter:
    1. Parameter name: `RequestName`
    2. Parameter type: `Drop down`
    3. Required: `checked`
    4. Allow multiple selection: `unchecked`
    5. Get data from: `Query`
5. In the JSON Input text block, insert this json snippet:
    ```
        requests
        | summarize by name
        | order by name asc
    ```
6. Use the blue `Run Query` button.
7. Choose 'Save' from the toolbar to create the parameter.
8. The RequestName parameter will be a drop down the names of all requests in the app.

   ![Image showing the creation of a dynamic drop down](../Images/Parameters-Dropdown-dynamic.png)

## Referencing drop down parameter
### In KQL
1. Add a query control to the workbook and select an Application Insights resource.
2. In the KQL editor, enter this snippet
    ```
        requests
        | where name == '{RequestName}'
        | summarize Requests = count() by bin(timestamp, 1h)

    ```
3. This expands on query evaluation time to:
    ```
        requests
        | where name == 'GET Home/Index'
        | summarize Requests = count() by bin(timestamp, 1h)
    ```

4. Run query to see the results. Optionally, render it as a chart.

   ![Image showing a drop down referenced in KQL](../Images/Parameters-Dropdown-Reference.png)


## Parameter Value, Label, Selection and Group
The query used in the dynamic drop down parameter above just returns a list of values that are rendered faithfully in the drop down. But what if you wanted a different display name, or one of these to be selected? Drop down parameters allow this via the value, label, selection and group columns.

The sample below shows how to get a list of Application Insights dependencies whose display names are styled with an emoji, has the first one selected, and is grouped by  operation names.
```
dependencies
| summarize by operation_Name, name
| where name !contains ('.')
| order by name asc
| serialize Rank = row_number()
| project value = name, label = strcat('🌐 ', name), selected = iff(Rank == 1, true, false), group = operation_Name
```
![Image showing a drop down parameter using value, label, selection and group options](../Images/Parameters-Dropdown-MoreOptions.png)


## Drop down parameter options
| Parameter | Explanation | Example |
| ------------- |:-------------|:-------------|
| `{DependencyName}` | The selected value | GET fabrikamaccount |
| `{DependencyName:label}` | The selected label | 🌐 GET fabrikamaccount |
| `{DependencyName:value}` | The selected value | GET fabrikamaccount |

See also: [Parameter Options](formatting.md)

## Multiple Selection
The examples so far explicitly set the parameter to select only one value in the drop down. Drop down parameters also support multiple selection - enabling this is as simple as checking the the `Allow multiple selection` option. 

The user also have the option of specifying the format of the result set via the `delimiter` and `quote with` settings. The default just returns the values as a collection in this form: 'a', 'b', 'c'. They also have the option to limit the number of selections.

The KQL referencing the parameter will need to change to work with the format of the result. The most common way to enable it is via the `in` operator.

```
dependencies
| where name in ({DependencyName})
| summarize Requests = count() by bin(timestamp, 1h), name
```

Here is an example for multi-select drop down at work:

![Image showing a multi-select drop down parameter](../Images/Parameters-Dropdown-multiselect.png)


## Dropdown special selections
Dropdown parameters also allow the ability for authors to specify special values that will also appear in the dropdown:
* Any one
* Any three
* ...
* Any 100
* Any custom limit
* All

When these special items are selected, the parameter value will be automatically set to the specific number of items, or all values.

## Special casing All
When the "All" option is selected, an additional field appears that allows the author to specify that a special value will be used for the parameter if the "All" option is selected. This is useful for cases where "All" could be a large number of items and could generate a very large query.

![Image showing a special case for all ](../Images/DropDownAll.png)

in this specific case, the string `[]` will be used instead of a value.  this can be used to generate an empty array in the a logs query, like:

```
let selection = dynamic([{Selection}]);
SomeQuery 
| where array_length(selection) == 0 or SomeField in (selection)
```

if all items are selected, the value of `Selection` will be `[]`, producing an empty array for the `selection` variable in the query.  If no values are selected, the value of `Selection` will be an empty string, also resulting in an empty array.  If any values are selected, they will be formatted inside the dynamic part, causing the array to have those values.  you can then test for `array_length` of 0 to have the filter not apply or `in` the array to filter on the values.

Other common examples use '*' as the special marker value when a parameter is required, and then test with
```
| where "*" in ({Selection}) or SomeField in ({Selection})
```


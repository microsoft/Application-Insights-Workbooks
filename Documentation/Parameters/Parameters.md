> [!NOTE] 
> This documentation for Azure workbooks is now located at: https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-parameters
> Please **do not** edit this file. All up-to-date information is in the new location and documentation should only be updated there.

# Workbook Parameters

Parameters allow workbook authors to collect input from the consumers and reference it in other parts of the workbook – usually to scope the result set or setting the right visual. It is a key capability that allows authors to build interactive reports and experiences. 

Workbooks allow you to control how your parameter controls are presented to consumers – text box vs. drop down, single- vs. multi-select, values from text, JSON, KQL or Azure Resource Graph, etc.  


## How do parameters work?
A workbook is represented as a directed graph of steps. After a parameter is declared, it can be used by steps that come *after* it in the graph. Parameters can also depend on other parameters.

Parameters have names, display names (labels), and values.
* The name of the parameter is how you use it elsewhere, like in queries. Parameter names are similar to that of javascript identifiers: alphanumeric text and underscores are allowed. No spaces/special characters.
* The display name (label) of the parameter is what users will see. The display name of the character *can* include special characters and spaces. Display names in templates will be localized.
* The value of the parameter is set at run time. Depending on the parameter type, the value is different types. The initial value of a parameter

Parameters and their values can be used in many ways:
* Replacements in query contents, text
* Time ranges in queries
* Labels, tooltips
* Resource / resource type selections 
* Controlling visibility of other steps in a workbook

Steps that reference a parameter will automatically be updated when the parameter value changes.

## Where do parameters come from?
Parameters can come from a few places, 

* [Creating Parameters with a Parameters Step](#Creating-Parameters-with-a-Parameters-Step) is the most common of which is explicitly declaring them in a parameters step.
These are the controls/settings you normally see in workbooks.
* [Exporting parameters from selections in grids/charts](../Interactivity.md)
The advanced settings of query and metrics steps allows you to export row values from grids, or x/y/series information in charts. This is commonly used in "drill in" like scenarios, where a selection in a grid causes another query to run and show details for the selected item.
* Time brushing in time charts
The advanced settings of query steps using a time chart allow you to export a range selected in a time chart as a time range parameter and used "downstream" of that chart, to focus a subsequent query on a specific time range.
* Links / Tabs / Buttons setting values in a Links step
Clicking a link or button or tab in a links step can also export a parameter to be used downstream. This is generally used to have the selected tab in a tab control hide/show other parts of a workbook.

# Creating Parameters with a Parameters Step
Supported parameter types include:
* [Time Range](Time.md) - allows a user to select from prepopulated time ranges or select a custom range
* [Drop down](DropDown.md) - allows a user to select one or more values from a set of values
* [Options Group](OptionsGroup.md) - allows a user to select a single value from a set of values
* [Text](Text.md) - allows a user to enter arbitrary text, including multi line editors
* [Resource](Resources.md) - allows a user to select one or more Azure resources
* [Subscription](Resources.md) - allows a user to select one or more Azure subscription resources
* Resource Type - allows a user to select one or more Azure resource type values
* Location - allows a user to select one or more Azure location values
* [Multi-value](MultiValue.md) - allows a user to add or remove arbitrary text items

## Creating an example time range parameter
1. Start with an empty workbook in edit mode.
2. Choose _Add_ from the toolbar and select _Parameters_ from the dropdown.
3. Click on the blue _Add Parameter_ button.
4. In the new parameter pane that pops up enter:
    1. Parameter name: `TimeRange` *(note that parameter __names__ can **not** include spaces or special characters)*
    2. Display name: `Time Range`  *(however, __display names__ can include spaces, special characters, emoji, etc)*
    2. Parameter type: `Time range picker`
    3. Required: `checked`
    4. Available time ranges: Last hour, Last 12 hours, Last 24 hours, Last 48 hours, Last 3 days, Last 7 days and Allow custom time range selection
5. Choose 'Save' from the toolbar to create the parameter.

![Image showing the creation of a time range parameter](../Images/Parameters-Time-Settings.png)

This is how the workbook will look like in read-mode, in the "Pills" style.

![Image showing a time range parameter in read mode](../Images/Parameters-Time.png)

## Referencing a parameter
### Via Bindings
1. Add a query control to the workbook and select the logs data source and an Application Insights resource or Log Analytics workspace.
2. Open the the _Time Range_ drop down and select the `Time Range` option from the Parameters section at the bottom.
3. This binds the time range parameter to the time range of the query. The time scope of the sample query is now Last 24 hours.
4. Run query to see the results

![Image showing a time range parameter referenced via bindings](../Images/Parameters-Time-Binding.png)

### In Logs/other queries
1. Add a query control to the workbook and select the logs data source and an Application Insights resource or Log Analytics workspace.
2. In the text, enter a time scope filter using the parameter: `| where timestamp {TimeRange}`  (using the appropriate column name for your table)
3. This expands on query evaluation time to `| where timestamp > ago(1d)` which is the time range value of the parameter.
*Note:* When using a time range this way in the query text instead of binding it with the time range drop down, make sure the time range drop down is set to "Set in query", or you'll get an intersection of the 2 time ranges.
4. Run query to see the results

![Image showing a time range referenced in a query](../Images/Parameters-Time-InCode.png)

### In Text 
1. Add a text control to the workbook.
2. In the markdown, enter `The chosen time range is {TimeRange:label}`
3. Choose _Done Editing_
4. The text control will show text: _The chosen time range is Last 24 hours_

## Parameter formatting
The _In Text_ section used the `label` of the parameter instead of its value. Parameters expose various such options depending on its type - e.g. time range pickers allow value, label, query, start, end, grain, and many other options.

Use the `Previews` section of the _Edit Parameter_ pane to see the formatting expansion options for your parameter:

![Image showing a time range parameter options](../Images/Parameters-Time-Previews.png)

For more specific examples of formatting times, see [Time formatting](./Time.md#Time-parameter-options)

## Formatting parameters using JSONPath
For string parameters that are JSON content, you can use a [JSONPath format](../Transformations/JSONPath.md) in the parameter format string.

For example, you may have a string parameter named `selection` that was the result of a query or selection in a visualization that has the following value
```json 
{ "series":"Failures", "x": 5, "y": 10 }
```

Using JSONPath, you could get individual values from that object:

format | result
---|---
`{selection:$.series}` | `Failures`
`{selection:$.x}` | `5`
`{selection:$.y}`| `10`

*Note:* If the parameter value is not valid json, the result of the format will be an empty value.

## Parameter Style
The following styles are available to layout the parameters in a parameters step
#### Pills
In pills style, the default style, the parameters look like text, and require the user to click them once to go into the edit mode.

![Pill style read mode](../Images/PillsReadMode.png)

![Pills style edit mode](../Images/PillsEditMode.png)

#### Standard
In standard style, the controls are always visible, with a label above the control.

![Standard style](../Images/Standard.png)

#### Form Horizontal
In horizontal style form, the controls are always visible, with label on left side of the control.

![Form Horizontal style](../Images/FormHorizontal.png)

#### Form Vertical
In vertical style from, the controls are always visible, with label above the control. Unlike standard style, there is only one label or control in one row. 

![Form Vertical style](../Images/FormVertical.png)

*Note:* In standard, form horizontal, and form vertical layouts, there's no concept of inline editing, the controls are always in edit mode. 

# Global parameters
Now that you've learned how parameters work, and the limitations about only being able to use a parameter "downstream" of where it is set, it is time to learn about global parameters, which change those rules.

With a global parameter, the parameter must still be *declared* before it can be used, but any step that sets a value to that parameter will affect *all* instances of that parameter in the workbook. 

**Note:** because changing a global parameter has this "update all" behavior, The global setting should only be turned on for parameters that require this behavior. A combination of global parameters that depend on each other can create a cycle or oscillation where the competing globals change each other over and over. In order to avoid cycles, you cannot "redeclare" a parameter that's been declared as global. Any subsequent declarations of a parameter with the same name will create a read only parameter that cannot be edited in that place.

Common uses of global parameters:

1. Synchronizing time ranges between many charts. 
    - without a global parameter, any time range brush in a chart will only be exported *after* that chart, so selecting a time range in the 3rd chart will only update the 4th chart
    - with a global parameter, you can create a global `timeRange` parameter up front, give it a default value, have all the other charts use that as their bound time range *and* as their time brush output (additionally setting the "only export the parameter when the range is brushed" setting). Now, any change of time range in *any* chart will update the global `timeRange` parameter at the top of the workbook. This can be used to make a workbook act like a dashboard.

2. Allowing changing the selected tab in a links step via links or buttons
    - without a global parameter, the links step only *outputs* a parameter for the selected tab
    - with a global parameter, you can create a global `selectedTab` parameter, and use that parameter name in the tab selections in the links step. This allows you to pass that parameter value into the workbook from a link, or by using another button or link to change the selected tab. Using buttons from a links step in this way can make a wizard-like experience, where buttons at the bottom of a step can affect the visible sections above it.


### Create a global parameter
When creating the parameter in a parameters step, use the "Treat this parameter as a global" option in advanced settings. The only way to make a global parameter is to declare it with a parameters step. The other methods of creating parameters (via selections, brushing, links, buttons, tabs) can only update a global parameter, they cannot themselves declare one.

![Global parameter setting](../Images/Parameters-global-setting.png)

The parameter will be available and function as normal parameters do.

#### Updating the value of a global parameter from other steps.
For the chart example above, the most common way to update a global parameter is by using [Time Brushing](../Visualizations/Timebrush.md).  

In this example, the `timerange` parameter above is declared as a global. In a query step below that, create and run a query that uses that `timerange` parameter in the query and returns a time chart result. In the advanced settings for the query step, enable the time range brushing setting, and use the *same* parameter name as the output for the time brush parameter, *and* also set the only export the parameter when brushed option.

![Global time brush setting](../Images/Global-timerange-brush.png)

Now, whenenever a time range is brushed in this chart, it will also update the `timerange` parameter *above* this query, and the query step itself (since it also depends on `timerange`!):

1) Before brushing:

   ![Before brushing](../Images/Global-before-brush.png)

    * The time range is shown as "last hour".
    * The chart shows the last hour of data.

2) During brushing:

   ![During brushing](../Images/Global-during-brush.png)

    * The time range is still last hour, and the brushing outlines are drawn.
    * No parameters/etc have changed. once you let go of the brush, the time range will be updated.


3) After brushing:

    ![After brushing](../Images/Global-after-brush.png)

    * The time range specified by the time brush will be set by this step, overriding the global value (the timerange dropdown now displays that custom time range).
    * Because the global value at the top has changed, and because this chart depends on `timerange` *as an input*, the time range of the query used in the chart will also update, causing the query to and the chart to update.
    * Any other steps in the workbook that depend on `timerange` will also update.

    (If you do *not* use a global parameter, the `timerange` parameter value will only change *below* this query step, things above or this item itself would not update)


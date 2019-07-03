# Parameter transformation to get OData filters

A common use case in workbooks is to capture user input via drop downs and use the selection in your queries. For instance, you may have a drop down to accept a set of virtual machines and then filter your KQL to include just the selected machines. In most cases, it is as simple as including the parameter's value in the query: 

```sql
Perf
| where Computer in ({Computers})
| take 5
```

In more advanced scenarios, you may need to transform the parameter results before they can be used in queries. Take this OData filter payload:

```json
{
    "name": "deviceComplianceTrend",
    "filter": "(OSFamily eq 'Android' or OSFamily eq 'OS X') and (ComplianceState eq 'Compliant')"
}
```

Let's say you want the values of the `OSFamily` and `ComplianceState` filters to come from drop downs in the workbook. The filter could include multiple values as in the `OsFamily` case above. It needs to also support the case where the user wants to include all dimension values (no filters essentially). Let's see how to make this happen in this happen.

## Setup parameters

1. Create an empty workbook and add a `Parameters` control.
2. Click `Add parameter` to create a new one. Use the following settings:
    1. Parameter name: `OsFilter`
    2. Display name: `Operating system`
    3. Parameter type: `Drop down`
    4. Allow multiple selections: `Checked`
    5. Delimiter: `or` (with spaces before and after)
    6. Quote with: `<empty>`
    7. Get data from: `JSON`
    8. Json Input
        ```json
        [
            { "value": "OSFamily eq 'Android'", "label": "Android" },
            { "value": "OSFamily eq 'OS X'", "label": "OS X" }
        ]
        ```
    9. In the 'Include in the drop down' section:
        1. Select 'All'
        2. Select All Value: `OSFamily ne '#@?'`
    10. Use the `Save` button in the toolbar to save this parameter. 

3. Add another parameter with these settings:
    1. Parameter name: `ComplianceStateFilter`
    2. Display name: `Complaince State`
    3. Parameter type: `Drop down`
    4. Allow multiple selections: `Checked`
    5. Delimiter: `or` (with spaces before and after)
    6. Quote with: `<empty>`
    7. Get data from: `JSON`
    8. Json Input
        ```json
        [
            { "value": "ComplianceState eq 'Compliant'", "label": "Compliant" },
            { "value": "ComplianceState eq 'Non-compliant'", "label": "Non compliant" }
        ]        
        ```
    9. In the 'Include in the drop down' section:
        1. Select 'All'
        2. Select All Value: `ComplianceState ne '#@?'`
    10. Use the `Save` button in the toolbar to save this parameter. 

4. Use one of the `Add text` links to add a text block. In the `Markdown text to display` block, add:
    ```json
    ```json
    {
        "name": "deviceComplianceTrend",
        "filter": "({OsFilter}) and ({ComplianceStateFilter})"
    }
    ```
    We will use this block to see the results of parameter selections.


__Parameter settings__
![Image showing parameter settings for the instructions](../Images/OData-Parameters-Settings.png)

## Single Filter Value
The simplest case is the selection of a single filter value in each of the dimensions. The drop down control uses Json input field's `value` as the parameter's value.

```json
{
    "name": "deviceComplianceTrend",
    "filter": "(OSFamily eq 'OS X') and (ComplianceState eq 'Compliant')"
}
```

![Image showing the result of single selection](../Images/OData-Parameters-Single-Select.png)

## Multiple Filter Values
If the user chooses multiple filter values (e.g. both Android and OS X operating systems), then parameters `Delimiter` and `Quote with` settings kicks in and produces this compound filter:

```json
{
    "name": "deviceComplianceTrend",
    "filter": "(OSFamily eq 'OS X' or OSFamily eq 'Android') and (ComplianceState eq 'Compliant')"
}
```

![Image showing the result of multiple selection](../Images/OData-Parameters-Multi-Select.png)

## No Filter Case
Another common case is having no filter for that dimension. This is equivalent to including all values of the dimensions as part of the result set. The way to enable it is by having an `All` option on the drop down and have it return a filter expression that always evaluates to `true` (e.g. _ComplianceState eq '#@?'_).

```json
{
    "name": "deviceComplianceTrend",
    "filter": "(OSFamily eq 'OS X' or OSFamily eq 'Android') and (ComplianceState ne '#@?')"
}
```

![Image showing the result of all selection](../Images/OData-Parameters-No-Select.png)


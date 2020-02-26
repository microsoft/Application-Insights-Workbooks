# Best Practices and hints for Logs queries

## Use the smallest possible time ranges by default
The longer the time ranges, the slower the queries, and the more data returned. For longer time ranges, the query might have to go to slower "cold" storage, making the query even slower. Default to the shortest useful time range, but allow the user to pick a larger time range that may be slower.

## Use "All" special value in dropdowns.
The dropdown parameter settings includes the ability to [add an "All" special item](../Parameters/DropDown.md#special-casing-all) to parameter dropdowns.  it also includes another setting to use a special value. Using an "All" special item correctly can dramatically simplify queries.

## Protect against columns that might not exist
If you are using custom table or custom columns, you should generally author your templates so that they work if the column is missing in a workspace.

See the [column_ifexists](https://docs.microsoft.com/en-us/azure/kusto/query/columnifexists) function.

## Protect against a table that might not exist
If your template is installed as part of a solution, or other case where the tables are guaranteed to exist, this is unnecessary, but if you are creating generic templates that might be visible on any resource or workspace, it is a good idea to protect for tables that don't exist.

The log analytics query language does not have a `table_ifexists` function like exists for testing for columns. 

However, there are some ways to do it, one of the simplest being a "[fuzzy union](https://docs.microsoft.com/en-us/azure/kusto/query/unionoperator?pivots=azuredataexplorer)".  When doing a union, you can use the `isfuzzy=true` setting to let the union continue if some of the tables do not exist.  You can take advantage of this by adding a parameter query in your workbook that checks for existence of the table, and hides other content if it does not.  A subtle bonus here is that items that are not visible are not run, so other query steps in the workbook that could fail if the table does not exist would not run until after the test verifies their existence, avoiding unnecessary failed queries.

for example:

```
let MissingTable = view () { print isMissing=1 };
union isfuzzy=true MissingTable, (AzureDiagnostics | getschema | summarize c=count() | project isMissing=iff(c > 0, 0, 1)) 
| top 1 by isMissing asc
```

This query will return `1` if the `AzureDiagnostics` table doesn't exist in the workspace. If the real table doesn't exist, the "fake" row of the MissingTable will be returned. If any columns exist in the schema for the `AzureDiagnostics` table, a `0` will be returned.  You could use this as a parameter value, and [conditionally hide](../Interactivity.md#conditional-visibility) your query steps unless the parameter value is 0.  You could also use the optional conditional visibility to show a text step to say that the current workspace does not have the missing table, and send the user to documentation on how to onboard.

Instead of hiding steps, you may just want to have no rows as a result.  In that case, you can change the `MissingTable` to be an empty datatable with the appropriate matching schema:

```
let MissingTable = datatable(ResourceId: string) [];
union isfuzzy=true MissingTable, (AzureDiagnostics
| extend ResourceId = column_ifexists('ResourceId', '')
```

In this case, the query will return no rows if the `AzureDiagnostics` table is missing, or if the `ResourceId` column is missing from the table.
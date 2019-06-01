

# Testing Preview Workbook Templates

You can test templates that are still work in progress or simply not ready to be exposed to all users. To do this you need to add the property `"isPreview: true"` in settings.json.
Here is an example:

```json
{
    "$schema": "https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/schema/settings.json",
    "name":"My template (preview)",
    "author": "Microsoft",
    "isPreview": true,
    "galleries": [
        { "type": "workbook", "resourceType": "microsoft.operationalinsights/workspaces", "order": 300 }
    ]
}
```

Once you have add marked your template as `isPreview`, you can see this workbook by adding `feature.includePreviewTemplates` in your Azure Portal Url. So you URL looks something like [https://portal.azure.com/?feature.includePreviewTemplates=true](https://portal.azure.com/?feature.includePreviewTemplates=true)
> [!NOTE] 
> This documentation for Azure workbooks is now located at: https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-chart-visualizations
> Please **do not** edit this file. All up-to-date information is in the new location and documentation should only be updated there.

# Chart Visualization

Workbooks allow monitoring data to be presented as charts. Supported chart types include line, bar, bar categorical, area, scatter plots, pie and time. Authors can choose to customize the height, width, color palette, legend, titles, no-data message, etc. of the chart, and customize axis types and series colors using chart settings.

Workbooks supports charts for both analytics logs and metric data sources. Use the links below to learn more about enabling charts for these.

* [Log charts](LogCharts.md)
* [Metric charts](MetricCharts.md)

## Time-series examples
### Area chart
![Image showing a metric area chart for Storage transactions in edit mode](../Images/MetricChart-Storage-Area-Edit.png)

### Segmented line chart
![Image showing a metric line chart for Storage transactions split by API name](../Images/MetricChart-Storage-Split-Line.png)

### Segmented bar chart ([Threshold Line enabled](#threshold-line))
![Image showing a large metric bar chart for Storage transactions split by response type](../Images/MetricChart-Storage-Bar-Large-2.png)

### Scatter chart
![Image showing a metric scatter chart for Storage latency](../Images/MetricChart-Storage-Scatter.png)

## Categorical examples
### Pie chart
![Image showing a log pie chart for request counts](../Images/LogChart-Pie.png)

### Bar categorical or Histogram
![Image showing a log histogram chart for request counts](../Images/LogChart-BarCategorical.png)

# Chart Settings
Authors can use chart settings to customize which fields are used in the chart axes, the axis units, custom formatting, ranges, grouping behaviors, legends, and series colors.

### The Settings tab
The settings tab controls:
* the axis settings, including which fields, custom formating that allows users to set the number formatting to the axis values, and custom ranges.
* grouping settings, including which field, the limits before an "Others" group is created
* legend settings, including showing metrics (series name, colors and numbers) at the bottom, and/or a legend (series names and colors)
* threshold line settings

![Image showing chart settings series tab](../Images/ChartSettings.png)

#### Custom Formatting
The custom formatting is same as Grid's custom formatting except "Custom text for missing values" is not applicable for charts. More description [here](https://github.com/microsoft/Application-Insights-Workbooks/blob/master/Documentation/Visualizations/Grid.md#custom-formatting).

![Image showing custom format settings](../Images/NumberFormatSettings.png)

#### Threshold Line
Add a threshold line to the chart at a Y value that you define. Supported chart types include line, bar, bar categorical, area, scatter chart, and time chart. To enable the threshold line on the chart, check the "Show threshold line" checkbox and set the Y value in chart settings in the "Custom threshold line" field.

![Image showing threshold line explicit setting](../Images/ThresholdLineSettingsManual.png)

Alternatively, you can link the Y value to a workbook parameter by inputting the parameter name wrapped in curley brackets (eg. {thresholdParam1}). 

![Image showing charts with threshold line enabled](../Images/ThresholdLineSettingsParam.png)

The threshold line will be updated on the chart whenever the linked parameter value is changed.

![Image showing chart with parameterized threshold line](../Images/ThresholdLineParamExample.png)

### The Series tab
The series settings tab lets you adjust the labels and colors shown for series in the chart.
* The `Series name` field is used to match a series in the data, and if matched, the display label and color will be displayed.
* the `Comment` field is useful for template authors, as this comment may be used by translators to localize the display labels

![Image showing chart settings series tab](../Images/SeriesSettings.png)


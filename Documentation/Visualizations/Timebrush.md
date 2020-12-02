# Using Time Brushing

When query or metrics steps are displaying time based data, additional options become available in the Advanced settings:

![time brush settings](../Images/TimeBrush-metrics-settings.png)

Enabling time range brushing allows a user to "brush" or "scrub" a range on a chart, and have that range be output as a parameter value.

There's an additional setting to only export a parameter when a range is explicitly brushed. 
* if this setting is unchecked (default), the parameter will always have a value, when not brushed, the parameter value will be the full time range displayed in the chart.
* If this setting is checked, the parameter value will only be set after a user brushes, and the parameter will have no value before that.

## Brushing in a metrics chart

When time brushing is enabled on a metrics chart, the user can "brush" a time by dragging the mouse on the time chart:

![metrics time brush in progress](../Images/TimeBrush-metrics-brushing.png)

Once the brush has stopped, the metrics chart will "zoom in" to that range, and export that range as a time range parameter.
An icon in the toolbar in the upper right corner will also become active, to reset the time range back to its original, un-zoomed time range.


## Brushing in a query chart

When time brushing is enabled on a query chart, indicators will appear that the use can drag, or the user can "brush" a range on the time chart:

![query time brush in progress](../Images/TimeBrush-query-brushing.png)

Once the brush has stopped, the query chart will that range as a time range parameter, but will *not* zoom in (this is *different* than the behavior of metrics charts; Because of the complexity of user written queries, it may not be possible for workbooks to correctly update the range used by the query in the query content directly. If the query is using a time range parameter, it is possible to get this behavior by using a [global parameter](../Parameters/Parameters.md#Global-Parameters) instead)

An icon in the toolbar in the upper right corner will also become active, to reset the time range back to its original, un-zoomed time range.


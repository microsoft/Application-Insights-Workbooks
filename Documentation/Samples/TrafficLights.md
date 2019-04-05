# Showing traffic lights status in workbooks

It is often desirable to summarize status using a simpler domain instead presenting the full range of values. For example, you may want to categorize your computers by CPU utilization as Cold/Warm/Hot OR user by the performance experienced as Satisfied/Tolerating/Frustrated. This can be as simple as showing an indicator or icon which represents the status next to the underlying metric. 

The example below shows how do setup a traffic light icon per computer based on the CPU utilization metric.

1. Create a new empty workbook.
2. Add a [time range parameter](https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/Documentation/Parameters/Time.md) called _TimeRange_
3. Use the _Add query_ link to add a log query control to the workbook. 
4. Select the query type as _Log_, resource type as _Log Analytics_ and the resources as an Log Analytics workspace in your subscription that has VM performance data.
5. Use the Query editor, enter:
    ```
    Perf
    | where ObjectName == 'Processor' and CounterName == '% Processor Time'
    | summarize Cpu = percentile(CounterValue, 95) by Computer
    | join kind = inner (Perf
        | where ObjectName == 'Processor' and CounterName == '% Processor Time'
        | make-series Trend = percentile(CounterValue, 95) default = 0 on TimeGenerated from {TimeRange:start} to {TimeRange:end} step {TimeRange:grain} by Computer
        ) on Computer
    | project-away Computer1, TimeGenerated
    | order by Cpu desc
    ```
6. Set the visualization to _Grid_
7. Click on _Column Settings_
8. In the _Columns_ section:
    1. _Cpu -_ Column renderer: `Thresholds`, Custom number formatting: `checked`, Units: `Percentage`, Threshold settings (last two need to be in order):
        1. Icon: `Success`, Operator: `Default`
        2. Icon: `Critical`, Operator: `>`, Value: `80`
        2. Icon: `Warning`, Operator: `>`, Value: `60`
    2. _Trend -_ Column renderer: `Spark line`, Color paletter: `Green to Red`, Minimum value: `60`, Maximum value: `80`
9. Click _Save and Close_ to commit changes.

![Image showing a grid with traffic light status using thresholds](../Images/ThresholdSample.png)

The grid looks like this in read-mode:

![Image showing a grid with traffic light status using thresholds in read mode](../Images/ThresholdSample-Read.png)

You can also pin this grid to a dashboard using the _Pin to dashboard_ button in toolbar. Note that the pinned grid automatically binds to the time range in the dashboard.

![Image showing a grid with traffic light status using thresholds in a dashboard](../Images/ThresholdSample-Pin.png)

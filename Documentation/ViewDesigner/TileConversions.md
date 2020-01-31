# Tile Conversions

### Jump to a section
* [Donut & List](#Donut-&-List)
* [Linechart & List](#Linechart-&-List)
* [Number & List](#Donut-&-List)
* [Timeline & List](#Timeline-&-List)
## Donut & List <a id="Donut-&-List"></a>


View Designer has the Donut & List tile as shown below:

![Donut List](./Examples/DonutList.png)

Recreating the tile in workbooks involves two separate visualizations, for the Donut portion there are two options.\
Select **Add query** and paste the original query from View Designer into the cell

**Option 1:** Select Pie Chart from the Visualization Dropdown
 ![Pie Chart Visualization Menu](./Examples/PieChart.png)

**Option 2:** Add a line to the KQL\
**Add:** _| render piechart_\
Note that the Visualization setting should be set to **Set by query**
 ![Visualization Menu](./Examples/SetByQuery.png)
**Example:**\
**Original:** search * | summarize AggregatedValue = count() by Type | order by AggregatedValue desc \
**Updated:** search * | summarize AggregatedValue = count() by Type | order by AggregatedValue desc | render piechart

### Additional Steps

To insert the list visualization, follow the steps [here](./CommonSteps.md#List).\
For enabling sparklines please reference the section on [customizing visualizations](./CommonSteps.md#Sparkline).\
To scale and resize the steps, change your advanced cell settings with these [instructions](./CommonSteps.md#Advanced).

The following is an example of how the Donut & List tile might be reinterpreted in Workbooks

![Donut List Workbooks](./Examples/DonutWorkbooks.png)

## Linechart & List <a id="Linechart-&-List"></a>
The original Linechart & List in View Designer looks like the following:
 
![Linechart List](./Examples/LineList.png) 

To recreate the Linechart portion we update the query as follows:\
**Original:** _search * | summarize AggregatedValue = count() by Type_\
**Updated:** _search * **| make-series Count = count() default=0 on TimeGenerated from {TimeRange:start} to {TimeRange:end} step {TimeRange:grain} by Type**_

There are two options for visualizing the line chart

**Option 1:** Select Line chart from the Visualization dropdown
 
 ![Linechart Menu](./Examples/LineViz.png)

**Option 2:** Add a line to the KQL
Add: | render linechart
Note that the Visualization setting should be set to Set by query

 ![Visualization Menu](./Examples/SetByQuery.png)

**Example:**
_search * | make-series Count = count() default=0 on TimeGenerated from {TimeRange:start} to {TimeRange:end} step {TimeRange:grain} by Type | render linechart_

### Additional Steps

To insert the list visualization, follow the steps [here](./CommonSteps.md#List).\
For enabling sparklines please reference the section on [customizing visualizations](./CommonSteps.md#Sparkline).\
To scale and resize the steps, change your advanced cell settings with these [instructions](./CommonSteps.md#Advanced).

The following is an example of how the Linechart & List tile might be reinterpreted in Workbooks

![Linechart List Workbooks](./Examples/LineWorkbooks.png)

## Number & List <a id="Number-&-List"></a>
The original View Designer Number & List looks as such:
 ![Tile List](./Examples/TileListEx.png)
For the number tile, update the query as such:

**Original:** _search * | summarize AggregatedValue = count() by Computer | count_\
**Updated:** _search *| summarize AggregatedValue = count() by Computer **| summarize Count = count()**_

Then change the Visualization dropdown to Tiles
 ![Tile Visualization](./Examples/TileViz.png)
Select Tile Settings
 ![Tile Settings](./Examples/TileSet.png)

From the sidebar menu, set Visualization to Tiles.

Underneath Tile Settings: 

Leave the Title section blank, and change Left to Use Column: Count, and the Column Renderer as Big Number


![Tile Settings](./Examples/TileSettings.png)
Advanced Settings \ Settings \ Chart title:  Computers sending data

### Additional Steps

To insert the list visualization, follow the steps [here](./CommonSteps.md#List).\
For enabling sparklines please reference the section on [customizing visualizations](./CommonSteps.md#Sparkline).\
To scale and resize the steps, change your advanced cell settings with these [instructions](./CommonSteps.md#Advanced).

The following is an example of how the Number & List tile might be reinterpreted in Workbooks

![Number List Workbooks](./Examples/NumberWorkbooks.png)

## Timeline & List <a id="Timeline-&-List"></a>
The Timeline & List in View Designer is shown below:

 ![Timeline List](./Examples/TimeList.png)

For the timeline simple update your query:

**Original:** _search * | sort by TimeGenerated desc_\
**Updated:** _search * **| summarize Count = count() by Computer, bin(TimeGenerated,{TimeRange:grain})**_

There are two options for visualizing as a bar chart

**Option 1:** Select Bar chart from the Visualization dropdown
 ![Barchart Visualization](./Examples/BarViz.png)
 
**Option 2:** Add a line to the KQL
Add: | render barchart
Note that the Visualization setting should be set to Set by query
 ![Visualization Menu](./Examples/SetByQuery.png)

 ### Additional Steps
 
To insert the list visualization, follow the steps [here](./CommonSteps.md#List).\
For enabling sparklines please reference the section on [customizing visualizations](./CommonSteps.md#Sparkline).\
To scale and resize the steps, change your advanced cell settings with these [instructions](./CommonSteps.md#Advanced).

The following is an example of how the Timeline & List tile might be reinterpreted in Workbooks

![Timeline List Workbooks](./Examples/TimeWorkbooks.png)


### [Return to start](./ViewDesignerOverview.md)

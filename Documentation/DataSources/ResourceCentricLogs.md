# Tutorial - resource centric logs queries in workbooks
This video shows you how to use resource level logs queries in Azure Workbooks. It also has tips and tricks on how to enable advanced scenarios and improve performance.

[![Making resource centric log queries in workbooks](https://img.youtube.com/vi/8CvjM0VvOA8/0.jpg)](https://youtu.be/8CvjM0VvOA8 "Video showing how to make resource centric log queries in workbooks")

### Dynamic resource type parameter
Uses dynamic scopes for more efficient querying. The snippet below uses this heuristc:
1. _Individual resources_: if the count of selected resource is less than or equal to 5
2. _Resource groups_: if the number of resources is over 5 but the number of resource groups the resources belong to is less than or equal to 3
3. _Subscriptions_: otherwise

```
Resources
| take 1
| project x = dynamic(["microsoft.compute/virtualmachines", "microsoft.compute/virtualmachinescalesets", "microsoft.resources/resourcegroups", "microsoft.resources/subscriptions"])
| mvexpand x to typeof(string)
| extend jkey = 1
| join kind = inner (Resources 
| where id in~ ({VirtualMachines})
| summarize Subs = dcount(subscriptionId), resourceGroups = dcount(resourceGroup), resourceCount = count()
| extend jkey = 1) on jkey
| project x, label = 'x', 
      selected = case(
        x in ('microsoft.compute/virtualmachinescalesets', 'microsoft.compute/virtualmachines') and resourceCount <= 5, true, 
        x == 'microsoft.resources/resourcegroups' and resourceGroups <= 3 and resourceCount > 5, true, 
        x == 'microsoft.resources/subscriptions' and resourceGroups > 3 and resourceCount > 5, true, 
        false)
```
### Static resource scope for querying multiple resource types
```json
[
    { "value":"microsoft.compute/virtualmachines", "label":"Virtual machine", "selected":true },
    { "value":"microsoft.compute/virtualmachinescaleset", "label":"Virtual machine scale set", "selected":true }
]
```
### Resource parameter grouped by resource type
```
Resources
| where type =~ 'microsoft.compute/virtualmachines' or type =~ 'microsoft.compute/virtualmachinescalesets' 
| where resourceGroup in~({ResourceGroups}) 
| project value = id, label = id, selected = false, 
      group = iff(type =~ 'microsoft.compute/virtualmachines', 'Virtual machines', 'Virtual machine scale sets') 
```

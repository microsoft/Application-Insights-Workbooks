# Using Groups

A group item in a workbook allows you to logically group a set of steps in a workbook.  The logical grouping can be useful for several things:

1. layout - in scenarios where you want items to "stack up" vertically, you can create a group of items that will all stack up, and set the styling of the group to be a percentage width, instead of setting percentage width on all the individual items.

2. visibility - in scenarios where you want many items to hide/show together, you can set the visibility of the entire group of items, isntead of setting visibility settings on each individual item. This can be very useful in templates that use tabs, as you can use a group as the content of the tab, and the entire group can be hidden/shown based on a parameter set by the selected tab.

3. performance - in cases where you have a very large template, with many tabs, etc, you can use groups to split up a single template into many templates, and each tab of the workbook can be a group that loads all of its content from that other template.  in these cases, the contents of the group won't load or run until a user makes that group visible


## using templates inside a group
When a group is configured to load from a template, that by default, that content will only be loaded "lazily", in that it will only load when the group is visible. 

When a template is loaded into a group, the workbook attempts to "merge" any parameters declared in the template being loaded with parameters already existing in the group.  Any parameters that already exist in the workbook with identical names will be "merged out" of the template being loaded (and if all parameters in a parameters step are merged out, the entire paramters step will disappear)

For example, consider a template that has 2 parameters at the top:

> jgardner todo: screenshot

1. `TimeRange` - a time range parameter
2. `Filter` - a text parameter

then a Group item loads a template that itself has 2 parameters and a text step:

> jgardner todo: screenshot

1. `TimeRange` - a time range parameter
2. `FilterB` - a text parameter.

when the group item's template is loaded, the `TimeRange` parameter will be merged out of the group, and you'll have a workbook that has a the initial parameters step with `TimeRange` and `Filter`, and the group's parameter step will only include `FilterB`, and the text step.

> jgardner todo: screenshot


If the loaded template had contained `TimeRange` and `Filter` (instead of `FilterB`), then the resulting workbook would have a param step, and a group with only the text step remaining.

# How to split a large template into many templates

When splitting a template into parts, you'll effectively need to split the template into many templates that all work individually. so if the top level template has a `TimeRange` parameter that other steps use, the individual group  templates need to also have a parameters step that defines those parameters.

The simplest way to do this is to temporarily make a top level workbook that contains only a single parameter item with all of the "shared" parameters that all of the templates will use. Then, for each "sub" template you are going to create, start with that temporary workbook, and save a copy and add all the content for the templates to the bottom.

It may be easier to do a lot of this splitting manually using a text editor, copying and pasting the sections out into new workbook files.


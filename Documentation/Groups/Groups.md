# Using Groups

A group item in a workbook allows you to logically group a set of steps in a workbook.  The logical grouping can be useful for several things:

1. layout - in scenarios where you want items to "stack up" vertically, you can create a group of items that will all stack up, and set the styling of the group to be a percentage width, instead of setting percentage width on all the individual items.

2. visibility - in scenarios where you want many items to hide/show together, you can set the visibility of the entire group of items, isntead of setting visibility settings on each individual item. This can be very useful in templates that use tabs, as you can use a group as the content of the tab, and the entire group can be hidden/shown based on a parameter set by the selected tab.

3. performance - in cases where you have a very large template, with many tabs, etc, you can use groups to split up a single template into many templates, and each tab of the workbook can be a group that loads all of its content from that other template.  in these cases, the contents of the group won't load or run until a user makes that group visible

## Group types
The workbook "group" item allows you to add a group of items to a workbook. As the author of a workbook, you specify which type of group it will be. There are 2 types of groups:

* **editable** - the group in the workbook allows you to add/remove/edit the contents of the items in the group. this is most commonly used for layout and visibility purposes.

*  **from template** - the group in the workbook loads from the contents of another template by its id.  the content of that template is loaded and merged into the workbook at runtime.  In edit mode, you cannot modify any of the contents of the group, as they will just load again from the template next time the item loads.

## Load types
There are several different ways that the content of a group may be loaded.  As the author of a workbook, you get to specify when and how the contents of the group will load

* **lazy** (the default) - the group will only load when the item is visible.  this allows a group to be used by tab items, and if the tab is never selected, the group never becomes visible, so the content isn't loaded.  
    - For groups created from a template, the content of the template is not retrieved and the items in the group are not created until the group becomes visible.  the user will see progress spinners for the whole group while the content is retrieved.
    - for editable groups, the content is loaded, but the items in the group are not created until the item becomes visible

* **delayed** - similar to lazy, except that the contents will be retrieved and created after some delay instead of waiting to become visible. this can be useful if you expect users to always see this content, but not load it immediately. This is useful for "below the fold" scenarios, where a user might not scroll down to see details before leaving, so the load can be delayed and possibly never executed if the user leaves the workbook before the delay expires.

* **explicit** - in this mode, a button is displayed where the group would be, and no content is retrieved or created until the user explicitly clicks the button to load the content. This is useful in "show more" scenarios, where the content might be expensive to compute or rarely used

* **always** - in this mode, the content of the group is always loaded and created as soon as the workbook loads. This mode is most freqently used when using a group only for layout purposes, where the content will always be visible.

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

For performance reasons, it is beneficial to break up a large template into many smaller templates that load some content lazily or on demand by the user. This makes the initial load faster, as the top level template can be much smaller.

When splitting a template into parts, you'll effectively need to split the template into many templates (calling them "sub-templates" for the rest of this document) that all work individually. So if the top level template has a `TimeRange` parameter that other steps use, the sub-templates need to also have a parameters step that defines a parameter with that exact name. This lets the sub-templates work independently as their own 100% functional templates, and lets them be loaded inside larger templates in groups.

The simplest way to do this is to temporarily make a top level workbook that contains only a single parameter item with all of the "shared" parameters that all of the templates will use. Then, for each "sub" template you are going to create, start with that temporary workbook, and save a copy and add all the content for the templates to the bottom.

It may be easier to do a lot of this splitting manually using a text editor, copying and pasting the sections out into new workbook files.

*technically*, the sub-templates don't *need* to have these parameters that get merged away, if you never intend on the sub-templates being visible by themselves, so you could remove them.  But it will make them very hard to edit if you ever need to edit them later.

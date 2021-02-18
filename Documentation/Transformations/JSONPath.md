# JSON Path

Workbooks is able to query data from many sources. Some endpoints, such as Azure Resource Manager or custom endpoint, can return results in JSON. If the JSON data returned by the queried endpoint is not configured in a format that you desire, JSONPath can be used to transform the results.

JSONPath is a query language for JSON that is similar to XPath for XML. Like XPath, JSONPath allows for the extraction and filtration of data out of a JSON structure.

Click [here](https://aka.ms/jsonpath) to learn more about JSON Path.

By using JSONPath transformation, Workbook authors are able to convert JSON into a table structure. The table can then be used to plot Workbook [visualizations](../Visualizations/Visualizations.md).

## Using JSONPath

1. Switch the workbook to edit mode by clicking on the _Edit_ toolbar item.
2. Use the _Add query_ link to add a query control to the workbook. 
3. Select the query type as _JSON_
4. Use the JSON editor to enter the following JSON snippet

```json
{ 
  "store": {
    "books": [ 
      { "category": "reference",
        "author": "Nigel Rees",
        "title": "Sayings of the Century",
        "publishDate": "20121204",
        "price": 8.95
      },
      { "category": "fiction",
        "author": "Evelyn Waugh",
        "title": "Sword of Honour",
        "publishDate": "19520101",
        "price": 12.99
      },
      { "category": "fiction",
        "author": "Herman Melville",
        "title": "Moby Dick",
        "isbn": "0-553-21311-3",
        "publishDate": "18511018",
        "price": 8.99
      },
      { "category": "fiction",
        "author": "J. R. R. Tolkien",
        "title": "The Lord of the Rings",
        "publishDate": "19540829",
        "isbn": "0-395-19395-8",
        "price": 22.99
      }
    ],
    "bicycle": {
      "color": "red",
      "price": 19.95
    }
  }
}
```

Let’s assume we are given the above JSON object as a representation of a store's inventory. Our task is to create a table of the store's available books by listing their titles, authors, and prices.

5. Select the _Result settings_ tab, and switch the result format from `Content` to `JSON Path`
6. Apply the following JSON Path Settings:
    1. JSON Path Table: `$.store.books`. This field represents the path to the root of the table. In this case, we care about the store's book inventory. The table path filters the JSON to the book information.
    2. Column IDs: `Title`, `Author`, `Price`, `Published`. These will be the column headers.
    3. Column JSON Paths: `$.title`, `$.author`, `$.price`, `$.publishedDate`. These fields represent the path from the root of the table to the column value. For each row in the table, the path will be applied.

7. Apply the above settings by clicking _Run Query_.

![Image showing the creation of a grid visualization using JSON Path](../Images/JSONPath-Example-Result.PNG)

## advanced scenarios: Using regular expressions to modify values, convert columns

In the example above, you can see that the published date is in a somewhat nonstandard format, as YYYMMMDD. With no other settings, the code sees this value as all numbers, and presumes this is a numeric value, not text, so you see right justified numbers.

To convert this into true dates, there are extra fields available to set in the result settings, the `Type`, `RegEx Match` and `Replace With` fields.

* `Type` - allows you to explicly change the type of the value returned by the api.  normally, you'd leave this unset (auto), and it will be handled for you. If, however auto doesn't work, you can use this to force the value to a different type.

* `Regex Match` - allows you to enter a regular expression to take part (or parts) of the value returned by the API instead of the whole value.  this is normally combined with the next field, `Replace With`

* `Replace With` - if a regular expression match is supplied, you can use this field to create the new value.  If no value is specified, it is implied to be `$&`, which is the match result of the expression.  Other values can be used to generate other output, see [string.replace documentation](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/replace#specifying_a_string_as_a_parameter) for more details.

In our example above, we want to convert `YYYYMMDD` format into `YYYY-MM-DD` which is a standard supported date parsing format.

1. Select the `Published` row in the grid.
2. Set the `Type` field to `Date/Time`. We want the resulting column to be a DateTime field so things like charts can work.
3. Set the `Regex Match` field to `([0-9]{4})([0-9]{2})([0-9]{2})`.  This is a regular expression that matches a 4 digit number, then 2 digit number, then another 2 digit number. The parentheses form capture groups that we can use in the next step
4. Set the `Replace With` field to `$1-$2-$3`. This is a replace expression that creates a new string with each captured group, with a hyphen between them, turning `"12345678"` into `"1234-56-78"`)
5. Re-run the query:
    ![datetime transform example](../Images/JSONPath-Example-DateTime.png)

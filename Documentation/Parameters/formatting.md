> [!NOTE] 
> This documentation for Azure workbooks is now located at: https://learn.microsoft.com/en-us/azure/azure-monitor/visualize/workbooks-parameters#parameter-formatting-options
> Please **do not** edit this file. All up-to-date information is in the new location and documentation should only be updated there.

# Parameter options

The following parameter options are applicable to all parameter types except Time range picker.

For Resource picker, resource Ids are formatted and for Subscription picker, subscription values are formatted.

## tomltojson
To convert toml to json, use `{param:tomltojson}`.

Value: 
```
name = "Sam Green"

[address]
state = "New York"
country = "USA"
```

Formatted Value:
```
{
  "name": "Sam Green",
  "address": {
    "state": "New York",
    "country": "USA"
  }
}
```

## escapejson
To escape, use `{param:escapejson}`.

Value: 
```
{
	"name": "Sam Green",
	"address": {
		"state": "New York",
		"country": "USA"
  }
}
```

Formatted Value:
```
{\r\n\t\"name\": \"Sam Green\",\r\n\t\"address\": {\r\n\t\t\"state\": \"New York\",\r\n\t\t\"country\": \"USA\"\r\n  }\r\n}
```

## base64
To encode text to base64, use `{param:base64}`.

Value: 
```
Sample text to test base64 encoding
```

Formatted Value:
```
U2FtcGxlIHRleHQgdG8gdGVzdCBiYXNlNjQgZW5jb2Rpbmc=
```
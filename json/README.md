# IA Documentation data

Converted MUI Architecture spreadsheet tabs live here as JSON, one file per
tab, so the frontend can hold the full spec in state and the agent only ever
receives the schema plus whichever tab is active.

## Layout

```
json/
  data/
    _schema.json      # index: tab name -> column list, kept in sync as tabs are added
    Scan.json
    Copy.json
    Settings.json
    ...
```

## Per-tab file shape

```json
{
  "tab": "Scan",
  "columns": ["Feature", "SMB", "Lynx", "Summary"],
  "rows": [
    { "Feature": "Scan to Computer", "SMB": "Yes", "Lynx": "Yes", "Summary": "..." }
  ]
}
```

## `_schema.json` shape

```json
{
  "tabs": [
    { "name": "Scan", "columns": ["Feature", "SMB", "Lynx", "Summary"] }
  ]
}
```

`_schema.json` is the "structural blueprint" sent to the agent on every
request (tab names + column headers only). The full row data for a tab is
only sent when that tab is the active context.

## Adding a sheet

Drop the raw sheet (CSV/paste) and it gets converted into
`data/<TabName>.json`, and `_schema.json` gets a matching entry appended.

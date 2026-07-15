#!/usr/bin/env python3
"""Converts xls/Scan.xlsx ('Scan App' sheet) into json/data/Scan.json.

Sheet layout (discovered by inspection, not assumed):
  Cols A-H  (1-8):   Version, source, Level 2..7 -- the feature outline, one row per UI element.
  Cols I-AZ (9-52):  44 printer-model columns. Header is 4 stacked rows:
                        row1 = product family (merged),  row3 = platform segment (merged),
                        row4 = model name,  row5 = engine class,  row6 = WIP/Ready status.
  Cols BA-BD (53-56): "Components: Setting row" -- per-row UI widget metadata (TextField/Button/...).
  Cols BF-BK (58-63): "Factory Quick Sets" -- per-row Default/- flags for Jupiter (& Beam MF) quicksets.
  Col BL (64):        EPICS/STORIES ticket references, per row.
  Col BM (65):        Design Notes, per row.
Real data ends at row 632; columns beyond BM are unused formatting artifacts.
"""
import json
import openpyxl
from openpyxl.utils import get_column_letter, column_index_from_string

SRC = "../xls/Scan.xlsx"
OUT = "json/data/Scan.json"
SCHEMA = "json/data/_schema.json"

MODEL_START, MODEL_END = column_index_from_string("I"), column_index_from_string("AZ")
COMPONENT_START, COMPONENT_END = column_index_from_string("BA"), column_index_from_string("BD")
QUICKSET_START, QUICKSET_END = column_index_from_string("BF"), column_index_from_string("BK")
EPIC_COL = column_index_from_string("BL")
NOTES_COL = column_index_from_string("BM")
LAST_ROW = 632


def merged_value(ws, row, col):
    """Returns the cell's value, resolving merged ranges to their anchor value."""
    cell = ws.cell(row=row, column=col)
    for rng in ws.merged_cells.ranges:
        if cell.coordinate in rng:
            return ws.cell(row=rng.min_row, column=rng.min_col).value
    return cell.value


def clean(v):
    if v is None:
        return None
    if isinstance(v, str):
        v = v.strip()
        return v if v else None
    return v


def main():
    wb = openpyxl.load_workbook(SRC, data_only=True)
    ws = wb["Scan App"]

    models = []
    for c in range(MODEL_START, MODEL_END + 1):
        name = clean(ws.cell(row=4, column=c).value)
        if not name:
            continue
        models.append({
            "key": name,
            "column": get_column_letter(c),
            "family": clean(merged_value(ws, 1, c)),
            "segment": clean(merged_value(ws, 3, c)),
            "engineClass": clean(ws.cell(row=5, column=c).value),
            "status": clean(ws.cell(row=6, column=c).value),
        })

    component_headers = {c: clean(ws.cell(row=4, column=c).value) for c in range(COMPONENT_START, COMPONENT_END + 1)}
    quickset_headers = {}
    for c in range(QUICKSET_START, QUICKSET_END + 1):
        name = clean(ws.cell(row=2, column=c).value)
        if name:
            quickset_headers[c] = {"key": name, "model": clean(ws.cell(row=4, column=c).value)}

    rows = []
    for r in range(7, LAST_ROW + 1):
        level_vals = [clean(ws.cell(row=r, column=c).value) for c in range(1, 9)]
        model_vals = {m["key"]: clean(ws.cell(row=r, column=column_index_from_string(m["column"])).value) for m in models}
        component_vals = {v: clean(ws.cell(row=r, column=c).value) for c, v in component_headers.items() if v}
        quickset_vals = {v["key"]: clean(ws.cell(row=r, column=c).value) for c, v in quickset_headers.items()}
        epic = clean(ws.cell(row=r, column=EPIC_COL).value)
        notes = clean(ws.cell(row=r, column=NOTES_COL).value)

        row_has_content = any(level_vals) or any(model_vals.values()) or any(component_vals.values()) or any(quickset_vals.values()) or epic or notes
        if not row_has_content:
            continue

        entry = {
            "row": r,
            "version": level_vals[0],
            "source": level_vals[1],
            "level2": level_vals[2],
            "level3": level_vals[3],
            "level4": level_vals[4],
            "level5": level_vals[5],
            "level6": level_vals[6],
            "level7": level_vals[7],
        }
        if any(model_vals.values()):
            entry["models"] = {k: v for k, v in model_vals.items() if v is not None}
        if any(component_vals.values()):
            entry["componentSetting"] = component_vals
        if any(quickset_vals.values()):
            entry["quickSets"] = quickset_vals
        if epic:
            entry["epicStory"] = epic
        if notes:
            entry["designNotes"] = notes

        rows.append(entry)

    out = {
        "tab": "Scan",
        "sheetName": "Scan App",
        "sourceFile": "xls/Scan.xlsx",
        "featureTreeColumns": ["version", "source", "level2", "level3", "level4", "level5", "level6", "level7"],
        "models": models,
        "quickSetColumns": list(quickset_headers.values()),
        "rows": rows,
    }

    with open(OUT, "w") as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {OUT}: {len(rows)} rows, {len(models)} models")

    with open(SCHEMA) as f:
        schema = json.load(f)
    schema["tabs"] = [t for t in schema["tabs"] if t["name"] != "Scan"]
    schema["tabs"].append({
        "name": "Scan",
        "columns": out["featureTreeColumns"] + [f"models.{m['key']}" for m in models],
    })
    with open(SCHEMA, "w") as f:
        json.dump(schema, f, indent=2)
    print(f"Updated {SCHEMA}")


if __name__ == "__main__":
    main()

# District map: data, honesty and limits

The planning screens draw a **district-level** interactive map (Leaflet). It never shows where an outlet is, because the competition data has no outlet or depot coordinates and no addresses (`outlets.csv` has only an ID, brand, district, depot, dock type, access and window).

## What the map draws

| Element | Source | Note |
|---|---|---|
| District shapes (all 25) | geoBoundaries gbOpen LKA ADM2 (2017), simplified | (c) OpenStreetMap contributors, **ODbL 1.0**. `apps/api/src/main/resources/geography/sri-lanka-districts.geojson`; the attribution is shown on every map |
| Served districts and their depot | `district_travel.csv` (database) | The 12 competition districts; others are grey context |
| Depot points | Peliyagoda and Kandy town centres | Town-level and approximate; the depots' exact sites are not in the data |
| Depot-to-district lines | `district_travel.csv` | Straight lines labelled with the competition's km and minutes; not roads |
| Shading and counts | The server | Step 1: orders per district (`GET /api/v1/dispatcher/orders/districts`). Step 3: orders not yet on a trip (`unassignedByDistrict` in the plan view) |
| Base map tiles | CARTO light tiles from the viewer's browser | Optional. If they cannot load, or the viewer switches "Base map" off, the districts still draw. Only tile coordinates leave the browser; no dataset content does |

`GET /api/v1/reference/geography` serves the shapes joined with the caller's own district travel rows (dispatcher and store manager, scoped by depot or outlet).

## What it deliberately does not do

- No outlet pins, no generated or "mock" coordinates, no road routing, no ETA from a map. Trip time, distance and fuel stay the competition's district formula.
- No coordinates feed the validator or any solver.

## Regenerating the shapes file

The file was produced from the geoBoundaries release `LKA/ADM2` simplified GeoJSON: names lose the " District" suffix, geometry is simplified (0.004°) and rounded to 4 decimals, and each district gets a label point inside its largest part. A one-off script is not kept in the repository; the steps above are the procedure.

## If real coordinates appear

If the organisers publish outlet coordinates, add them as reference data with a source, then draw outlets on this same map and consider road routing as a visualisation layer only. See `TECHNICAL_REFERENCE.md` section 5 (the map problem).

# BEA Growth & PCE Evidence Foundation V1

Inactive, dependency-only foundation. Exactly three published level families; no runtime caller or production acquisition. BEA is the sole upstream publisher.

## Official evidence

- [BEA API guide](https://apps.bea.gov/api/_pdf/bea_web_service_api_user_guide.pdf), introduction and Appendix B (NIPA): HTTPS GET at `https://apps.bea.gov/api/data/`; registered 36-character UserID; GetData, datasetname, TableName, Frequency, Year, ResultFormat; BEAAPI Request/Results/Error envelopes; TimePeriod, SeriesCode, LineNumber, LineDescription, Metric_Name, CL_UNIT, UNIT_MULT, comma-formatted DataValue; NoteRef links to Notes. TableID is deprecated and is not used.
- [BEA's own client documentation](https://us-bea.github.io/beaapi/README.html): current uppercase METRIC_NAME, Level calculation type, UNIT_MULT, NoteRef/NoteText, and table title notes with a LastRevised suffix. API scaling can differ from the units in the display table title: UNIT_MULT controls captured numeric scaling.
- [Official section 1 workbook](https://apps.bea.gov/national/Release/XLS/Survey/Section1All_xls.xlsx), sheet T10106-Q, published September 30, 2026: T10106 line 1, A191RX, Gross domestic product; quarterly real GDP; millions of chained (2017) dollars, seasonally adjusted at annual rates.
- [Official section 2 workbook](https://apps.bea.gov/national/Release/XLS/Survey/Section2All_xls.xlsx), sheet T20804-M, published September 30, 2026: monthly price indexes, 2017=100, seasonally adjusted; line 1 DPCERG Personal consumption expenditures (PCE); line 25 DPCCRG PCE excluding food and energy. Market-based lines are distinct and are not selected.
- User-supplied direct official live BEA API evidence (continuation instruction): T20804 lines 1/DPCERG and 25/DPCCRG each have CL_UNIT `Level`, UNIT_MULT `0`, and monthly TimePeriod examples 2025M01–2025M12. This closes the previously identified blocker. No credential was accessed by this implementation; tests use synthetic credentials and offline fixtures.

## Binding and capture policy

GDP uses one T10106/Q response. PCE and core PCE share one T20804/M response. Requests allow at most five explicit unique years, never ALL/X. Every selected row binds table, line, series code, description, frequency, metric, level calculation, scale and linked notes. The documented Metric_Name spelling and current METRIC_NAME spelling are supported; conflicting aliases fail closed.

Reference year is read from the selected observation's linked official table title, never frozen at 2017. GDP retains the API UNIT_MULT exponent (bounded to ±18) without rescaling DataValue. PCE requires the verified zero exponent. Unrecognized future table-note formats fail closed. The locked source specification records seasonal adjustment from official tables; notes are preserved, not used to invent release times.

Observations carry a deterministic `bea-source-notes-v1` encoding with the bound row identity, calculation, multiplier, reference year, and sorted linked NoteRef/NoteText pairs. Unreferenced notes and unselected values do not affect identity. The documented table-note ` - LastRevised:` suffix is excluded as revision timing; the semantic title and other linked note text are retained. Unusable selected values fail closed; absent periods remain gaps. No missing marker is interpreted as a numeric fact.

`bea-selected-series-v1:sha256:` identifies Chronoverse captured content, not an official BEA revision. Hash input includes the entire locked specification, captured unit and normalized observations/annotations. Credentials, request order, response order, capture time and irrelevant envelope metadata are excluded.

The trusted completion clock is sampled after complete response/fact validation. knownAt equals fetchedAt and Redis score. releaseTimestamp is absent. Persistence reuses the existing generic immutable CAS engine unchanged, with BEA keys and validated source bindings. History comprises only captures actually obtained; uncaptured historical vintages cannot be reconstructed.

Both PCE lines must validate before either write, but their separate Redis appends are not atomic. Per-key outcomes expose successes, failures and cancellation without rolling back immutable captures. Dependency TypeError/ReferenceError defects propagate; expected errors use static codes. Authentication and storage dependencies are injected, with no BEA environment reads or production instance.

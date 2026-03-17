# import_sources.ps1
# DEPRECATED: SGO and TheRundown imports removed.
# Odds data now comes from The Odds API via fetch_oddsapi_props.ts.
# PP/UD props come from their respective scrapers (fetch_props.ts, fetch_underdog_props.ts)
# which are themselves deprecated in favour of OddsAPI DFS books.
# This file is kept as a placeholder; do not call it from any active pipeline.
Write-Warning "import_sources.ps1: SGO and TheRundown removed. Use OddsAPI (ODDSAPI_KEY). Exiting."
exit 0

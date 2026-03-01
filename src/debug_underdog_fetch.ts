// src/debug_underdog_fetch.ts
import { fetchUnderdogRawProps } from "./fetch_underdog_props";

async function main() {
  const picks = await fetchUnderdogRawProps(['NBA']); // Default to NBA for debug
  console.log("Underdog picks count:", picks.length);
  console.log(JSON.stringify(picks.slice(0, 5), null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

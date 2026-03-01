// src/test_sgo.ts

import { fetchSgoProps } from "./fetch_sgo_props";

async function main() {
  try {
    const props = await fetchSgoProps();
    console.log("Got", props.length, "SportsGameOdds props");
    console.log(JSON.stringify(props.slice(0, 10), null, 2));
  } catch (err) {
    console.error("fetchSgoProps error:", err);
    process.exit(1);
  }
}

main();

/**
 * Phase 17X — Must be imported first from optimizer entrypoints so CLI is parsed once
 * and set before any module reads {@link getCliArgs} / {@link cliArgs}.
 */
import "./load_env";
import {
  resolveCliArgsFromProcessArgv,
  setCliArgsForProcess,
  handleCliArgsEarlyExit,
} from "./cli_args";

const cli = resolveCliArgsFromProcessArgv();
handleCliArgsEarlyExit(cli);
setCliArgsForProcess(cli);

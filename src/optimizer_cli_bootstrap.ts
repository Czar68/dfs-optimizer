// Phase 17X: CLI bootstrap - parse args before any other imports
import { resolveCliArgsFromProcessArgv, handleCliArgsEarlyExit, setCliArgsForProcess } from "./cli_args";

// Parse CLI args and set as process singleton
const args = resolveCliArgsFromProcessArgv();
handleCliArgsEarlyExit(args);
setCliArgsForProcess(args);

export function bootstrapOptimizer(): void {
  // Initialize any required optimizer settings
  console.log('Optimizer bootstrap completed');
}

import "server-only";

import { createEurostatMacroVintagesBackupExecutionV1 } from "./eurostatMacroVintagesBackupExecution";
import { readEurostatMacroVintagesRedisV1 } from "./eurostatMacroVintagesRedisProductionReader";
import { writeChronoverseBackupObjectToR2V1 } from "./r2ProductionWriter";

/** Only an explicit caller runs the reader, capture clock, builder, and writer. */
export function runEurostatMacroVintagesBackupProductionV1() {
  return createEurostatMacroVintagesBackupExecutionV1({
    readVintages: readEurostatMacroVintagesRedisV1,
    nowUnixSeconds: () => Math.floor(Date.now() / 1000),
    writeBackup: writeChronoverseBackupObjectToR2V1,
  }).execute();
}

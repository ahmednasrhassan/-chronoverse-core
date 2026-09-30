import {
  buildEurostatMacroVintagesBackupV1,
  EurostatMacroVintagesBackupInputErrorV1,
  type EurostatMacroVintagesBackupInputErrorCodeV1,
} from "./eurostatMacroVintagesBackup";
import {
  EurostatMacroVintagesRedisReaderErrorV1,
  type EurostatMacroVintagesRedisReadResultV1,
  type EurostatMacroVintagesRedisReaderErrorCodeV1,
} from "./eurostatMacroVintagesRedisReader";
import {
  ChronoverseBackupObjectValidationErrorV1,
  type ChronoverseBackupObjectV1,
  type ChronoverseBackupObjectValidationCodeV1,
} from "./backupObject";
import type { R2BackupWriteResultV1 } from "./r2BackupWriter";

export interface EurostatMacroVintagesBackupExecutionDependenciesV1 {
  readonly readVintages: () => Promise<EurostatMacroVintagesRedisReadResultV1>;
  readonly nowUnixSeconds: () => number | Promise<number>;
  readonly writeBackup: (object: ChronoverseBackupObjectV1) => Promise<R2BackupWriteResultV1>;
}

export type EurostatMacroVintagesBackupExecutionResultV1 =
  | { readonly stage: "read"; readonly status: EurostatMacroVintagesRedisReaderErrorCodeV1 }
  | { readonly stage: "build"; readonly status: "invalid-input"; readonly code: EurostatMacroVintagesBackupInputErrorCodeV1 }
  | { readonly stage: "build"; readonly status: "backup-object-validation"; readonly code: ChronoverseBackupObjectValidationCodeV1 }
  | { readonly stage: "write"; readonly result: R2BackupWriteResultV1 }
  | { readonly stage: "unexpected"; readonly origin: "read" | "clock" | "build" | "write" };

/**
 * Each individual ZSET read is complete, but HICP and GDP are not an atomic
 * cross-key snapshot. Capture time marks completion of both reads; stronger
 * cross-key consistency remains future work.
 */
export function createEurostatMacroVintagesBackupExecutionV1(
  dependencies: EurostatMacroVintagesBackupExecutionDependenciesV1,
): { readonly execute: () => Promise<EurostatMacroVintagesBackupExecutionResultV1> } {
  return Object.freeze({
    execute: async (): Promise<EurostatMacroVintagesBackupExecutionResultV1> => {
      let vintages: EurostatMacroVintagesRedisReadResultV1;
      try {
        vintages = await dependencies.readVintages();
      } catch (error) {
        return error instanceof EurostatMacroVintagesRedisReaderErrorV1
          ? { stage: "read", status: error.code }
          : { stage: "unexpected", origin: "read" };
      }

      let createdAtUnixSeconds: number;
      try {
        createdAtUnixSeconds = await dependencies.nowUnixSeconds();
      } catch {
        return { stage: "unexpected", origin: "clock" };
      }

      let backupObject: ChronoverseBackupObjectV1;
      try {
        backupObject = buildEurostatMacroVintagesBackupV1({
          createdAtUnixSeconds,
          hicp: vintages.hicp,
          gdp: vintages.gdp,
        });
      } catch (error) {
        if (error instanceof EurostatMacroVintagesBackupInputErrorV1) {
          return { stage: "build", status: "invalid-input", code: error.code };
        }
        if (error instanceof ChronoverseBackupObjectValidationErrorV1) {
          return { stage: "build", status: "backup-object-validation", code: error.code };
        }
        return { stage: "unexpected", origin: "build" };
      }

      try {
        return { stage: "write", result: await dependencies.writeBackup(backupObject) };
      } catch {
        return { stage: "unexpected", origin: "write" };
      }
    },
  });
}

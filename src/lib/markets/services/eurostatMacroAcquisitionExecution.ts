import {
  EurostatMacroSeriesVintagePersistenceError,
  appendEurostatMacroSeriesVintageRedisV1,
  type AppendEurostatMacroSeriesVintageRedisResultV1,
} from "../persistence/eurostatMacroSeriesVintageRedis";
import {
  EurostatResponseTooLargeError,
  EurostatTransportError,
  eurostatClientV1,
} from "../providers/eurostat/client";
import {
  EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
  type EurostatEuroAreaMacroFamilyV1,
} from "../providers/eurostat/macroSeries";
import {
  acquireEurostatMacroSeriesV1,
  EurostatMacroSeriesValidationError,
  type EurostatMacroAcquisitionDependenciesV1,
} from "./eurostatMacroAcquisition";

/** Minimum interval after a successful acquisition in one executor instance. */
export const EUROSTAT_MACRO_MIN_ACQUISITION_CADENCE_SECONDS_V1 = 6 * 60 * 60;
/** Minimum interval after a failed or rejected acquisition in one instance. */
export const EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1 = 5 * 60;

type AcceptedAppend = Extract<
  AppendEurostatMacroSeriesVintageRedisResultV1,
  { readonly status: "initialized" | "advanced" | "unchanged" }
>;
type RejectedAppend = Extract<
  AppendEurostatMacroSeriesVintageRedisResultV1,
  { readonly status: "stale" | "conflict" }
>;

export type EurostatMacroAcquisitionExecutionResultV1 =
  | { readonly status: "acquired"; readonly persistence: AcceptedAppend }
  | { readonly status: "persistence-rejected"; readonly persistence: RejectedAppend }
  | { readonly status: "skipped-in-flight" }
  | { readonly status: "skipped-cooldown"; readonly nextEligibleAt: number }
  | { readonly status: "skipped-failure-backoff"; readonly nextEligibleAt: number }
  | { readonly status: "provider-failure"; readonly error: unknown }
  | { readonly status: "resource-limit-failure"; readonly error: EurostatResponseTooLargeError }
  | { readonly status: "validation-failure"; readonly error: unknown }
  | { readonly status: "persistence-failure"; readonly error: unknown }
  | { readonly status: "clock-failure"; readonly error: unknown }
  | { readonly status: "unexpected-failure"; readonly error: unknown };

export interface EurostatMacroAcquisitionExecutorV1 {
  readonly execute: (
    family: EurostatEuroAreaMacroFamilyV1,
  ) => Promise<EurostatMacroAcquisitionExecutionResultV1>;
}

type FailureStatus = Extract<
  EurostatMacroAcquisitionExecutionResultV1,
  { readonly error: unknown }
>["status"];

class AcquisitionStageError extends Error {
  constructor(
    readonly status: FailureStatus,
    readonly originalError: unknown,
  ) {
    super(`Eurostat macro acquisition failed: ${status}.`);
    this.name = "AcquisitionStageError";
  }
}

interface FamilyExecutionState {
  inFlight: boolean;
  lastSuccessfulAcquisitionAt: number | null;
  failureRetryNotBefore: number | null;
}

function nextTime(at: number, seconds: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, at + seconds);
}

function failureResult(error: unknown): EurostatMacroAcquisitionExecutionResultV1 {
  if (error instanceof EurostatMacroSeriesValidationError) {
    return Object.freeze({ status: "validation-failure", error });
  }
  if (error instanceof AcquisitionStageError) {
    const original = error.originalError;
    switch (error.status) {
      case "provider-failure":
        return Object.freeze({ status: "provider-failure", error: original });
      case "resource-limit-failure":
        if (original instanceof EurostatResponseTooLargeError) {
          return Object.freeze({ status: "resource-limit-failure", error: original });
        }
        break;
      case "validation-failure":
        return Object.freeze({ status: "validation-failure", error: original });
      case "persistence-failure":
        return Object.freeze({ status: "persistence-failure", error: original });
      case "clock-failure":
        return Object.freeze({ status: "clock-failure", error: original });
      default:
        break;
    }
  }
  return Object.freeze({ status: "unexpected-failure", error });
}

/**
 * State is scoped to one executor instance. The exported production executor is
 * one singleton per server process. Separate processes have separate state;
 * this does not provide a distributed lock or fleet-wide cadence guarantee.
 * Creating it never starts acquisition, polling, or scheduling.
 */
export function createEurostatMacroAcquisitionExecutorV1(
  dependencies: EurostatMacroAcquisitionDependenciesV1,
): EurostatMacroAcquisitionExecutorV1 {
  const state: Record<EurostatEuroAreaMacroFamilyV1, FamilyExecutionState> = {
    hicp: {
      inFlight: false,
      lastSuccessfulAcquisitionAt: null,
      failureRetryNotBefore: null,
    },
    gdp: {
      inFlight: false,
      lastSuccessfulAcquisitionAt: null,
      failureRetryNotBefore: null,
    },
  };

  const trustedClock = async (): Promise<number> => {
    let value: number;
    try {
      value = await dependencies.nowUnixSeconds();
    } catch (error) {
      throw new AcquisitionStageError("clock-failure", error);
    }
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new AcquisitionStageError(
        "clock-failure",
        new TypeError("Eurostat macro execution clock is invalid."),
      );
    }
    return value;
  };

  const guardedDependencies: EurostatMacroAcquisitionDependenciesV1 = {
    loadDataset: async (sourceUrl) => {
      try {
        return await dependencies.loadDataset(sourceUrl);
      } catch (error) {
        if (error instanceof EurostatResponseTooLargeError) {
          throw new AcquisitionStageError("resource-limit-failure", error);
        }
        if (error instanceof EurostatTransportError) {
          throw new AcquisitionStageError("provider-failure", error);
        }
        throw error;
      }
    },
    nowUnixSeconds: trustedClock,
    appendVintage: async (family, series) => {
      try {
        return await dependencies.appendVintage(family, series);
      } catch (error) {
        if (error instanceof EurostatMacroSeriesVintagePersistenceError) {
          throw new AcquisitionStageError(
            error.code === "invalid-current"
              ? "validation-failure"
              : "persistence-failure",
            error,
          );
        }
        throw error;
      }
    },
  };

  return Object.freeze({
    execute: async (family: EurostatEuroAreaMacroFamilyV1) => {
      if (!Object.prototype.hasOwnProperty.call(
        EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1,
        family,
      )) {
        return Object.freeze({
          status: "validation-failure" as const,
          error: new TypeError("Eurostat macro family is invalid."),
        });
      }

      const familyState = state[family];
      if (familyState.inFlight) {
        return Object.freeze({ status: "skipped-in-flight" as const });
      }
      familyState.inFlight = true;
      try {
        let attemptAt: number;
        try {
          attemptAt = await trustedClock();
        } catch (error) {
          return failureResult(error);
        }

        const previous = familyState.lastSuccessfulAcquisitionAt;
        if (previous !== null && attemptAt < nextTime(
          previous,
          EUROSTAT_MACRO_MIN_ACQUISITION_CADENCE_SECONDS_V1,
        )) {
          return Object.freeze({
            status: "skipped-cooldown" as const,
            nextEligibleAt: nextTime(
              previous,
              EUROSTAT_MACRO_MIN_ACQUISITION_CADENCE_SECONDS_V1,
            ),
          });
        }
        if (familyState.failureRetryNotBefore !== null &&
            attemptAt < familyState.failureRetryNotBefore) {
          return Object.freeze({
            status: "skipped-failure-backoff" as const,
            nextEligibleAt: familyState.failureRetryNotBefore,
          });
        }

        const completionClock = async (): Promise<number> => {
          const completedAt = await trustedClock();
          if (completedAt < attemptAt) {
            throw new AcquisitionStageError(
              "clock-failure",
              new TypeError("Eurostat macro completion clock moved backwards."),
            );
          }
          return completedAt;
        };

        try {
          const persistence = await acquireEurostatMacroSeriesV1(
            family,
            guardedDependencies,
          );
          const completedAt = await completionClock();
          if (persistence.status === "stale" || persistence.status === "conflict") {
            familyState.failureRetryNotBefore = nextTime(
              completedAt,
              EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1,
            );
            return Object.freeze({ status: "persistence-rejected" as const, persistence });
          }
          familyState.lastSuccessfulAcquisitionAt = completedAt;
          familyState.failureRetryNotBefore = null;
          return Object.freeze({ status: "acquired" as const, persistence });
        } catch (error) {
          if (error instanceof AcquisitionStageError &&
              error.status === "clock-failure") {
            return failureResult(error);
          }
          let completedAt: number;
          try {
            completedAt = await completionClock();
          } catch (clockError) {
            return failureResult(clockError);
          }
          familyState.failureRetryNotBefore = nextTime(
            completedAt,
            EUROSTAT_MACRO_FAILURE_RETRY_BACKOFF_SECONDS_V1,
          );
          return failureResult(error);
        }
      } finally {
        familyState.inFlight = false;
      }
    },
  });
}

const productionDependencies: EurostatMacroAcquisitionDependenciesV1 = {
  loadDataset: (sourceUrl) => eurostatClientV1.getDataset(sourceUrl),
  nowUnixSeconds: () => Math.floor(Date.now() / 1_000),
  appendVintage: appendEurostatMacroSeriesVintageRedisV1,
};

const productionExecutor = createEurostatMacroAcquisitionExecutorV1(
  productionDependencies,
);

/** Explicit future wiring only; importing this module performs no acquisition. */
export function executeEurostatMacroAcquisitionV1(
  family: EurostatEuroAreaMacroFamilyV1,
): Promise<EurostatMacroAcquisitionExecutionResultV1> {
  return productionExecutor.execute(family);
}

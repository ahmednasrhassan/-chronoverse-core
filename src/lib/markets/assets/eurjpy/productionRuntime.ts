import {
  runCanonicalLiveEcbFxIntelligenceV1,
  type EcbFxProductionIntelligenceV1,
  type EcbFxProductionRuntimeDependenciesV1,
} from "../ecbFxProductionRuntime";
import { eurjpyProfile } from "./profile";

export type EurJpyProductionIntelligenceV1 = EcbFxProductionIntelligenceV1;
export type EurJpyProductionRuntimeDependenciesV1 =
  EcbFxProductionRuntimeDependenciesV1;

export function getCanonicalLiveEurJpyIntelligence(
  dependencies: EurJpyProductionRuntimeDependenciesV1 = {},
): Promise<EurJpyProductionIntelligenceV1> {
  return runCanonicalLiveEcbFxIntelligenceV1(
    "eurjpy",
    eurjpyProfile,
    "EUR/JPY",
    dependencies,
  );
}

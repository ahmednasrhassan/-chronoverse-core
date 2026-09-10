import {
  runCanonicalLiveEcbFxIntelligenceV1,
  type EcbFxProductionIntelligenceV1,
  type EcbFxProductionRuntimeDependenciesV1,
} from "../ecbFxProductionRuntime";
import { eurchfProfile } from "./profile";

export type EurChfProductionIntelligenceV1 = EcbFxProductionIntelligenceV1;
export type EurChfProductionRuntimeDependenciesV1 =
  EcbFxProductionRuntimeDependenciesV1;

export function getCanonicalLiveEurChfIntelligence(
  dependencies: EurChfProductionRuntimeDependenciesV1 = {},
): Promise<EurChfProductionIntelligenceV1> {
  return runCanonicalLiveEcbFxIntelligenceV1(
    "eurchf",
    eurchfProfile,
    "EUR/CHF",
    dependencies,
  );
}

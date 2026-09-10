import {
  runCanonicalLiveEcbFxIntelligenceV1,
  type EcbFxProductionIntelligenceV1,
  type EcbFxProductionRuntimeDependenciesV1,
} from "../ecbFxProductionRuntime";
import { eurgbpProfile } from "./profile";

export type EurGbpProductionIntelligenceV1 = EcbFxProductionIntelligenceV1;
export type EurGbpProductionRuntimeDependenciesV1 =
  EcbFxProductionRuntimeDependenciesV1;

export function getCanonicalLiveEurGbpIntelligence(
  dependencies: EurGbpProductionRuntimeDependenciesV1 = {},
): Promise<EurGbpProductionIntelligenceV1> {
  return runCanonicalLiveEcbFxIntelligenceV1(
    "eurgbp",
    eurgbpProfile,
    "EUR/GBP",
    dependencies,
  );
}

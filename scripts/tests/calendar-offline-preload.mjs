// Node 24 native TypeScript stripping avoids tsx's Windows user/temp-directory
// initialization. No transpilation output, provider, environment or app startup.
import "./server-only-preload.mjs";
import { registerHooks } from "node:module";

const root = new URL("../../", import.meta.url);
const allowed = new Set([
  "src/lib/markets/calendar/contracts.ts",
  "src/lib/markets/calendar/validation.ts",
  "src/lib/markets/calendar/history.ts",
  "src/lib/markets/calendar/projections.ts",
  "src/lib/markets/calendar/officialPolicySchedules.ts",
  "src/lib/markets/calendar/officialScheduleExtraction.ts",
  "src/lib/markets/calendar/officialScheduleAcquisition.ts",
  "src/lib/markets/calendar/capturePersistence.ts",
  "src/lib/markets/calendar/captureArchive.ts",
  "src/lib/markets/calendar/r2CaptureArchiveConfig.ts",
  "src/lib/markets/calendar/r2CaptureArchiveTransport.ts",
  "src/lib/markets/calendar/r2CaptureArchiveQualification.ts",
  "src/lib/markets/calendar/r2QualificationApproval.ts",
  "src/lib/markets/calendar/r2QualificationApprovalAuthority.ts",
  "src/lib/markets/calendar/r2QualificationApprovalAuthorityStoreValidation.ts",
  "src/lib/markets/events/ecbMonetaryPolicy.ts",
  "src/lib/markets/events/eventClock.ts",
  "src/lib/markets/tests/calendar/fixtures.ts",
  "src/lib/markets/tests/calendar/officialPolicyScheduleFixtures.ts",
  "src/lib/markets/tests/calendar/officialPolicySchedules.test.ts",
  "src/lib/markets/tests/calendar/officialScheduleExtraction.test.ts",
  "src/lib/markets/tests/calendar/officialScheduleAcquisition.test.ts",
  "src/lib/markets/tests/calendar/capturePersistenceFixtures.ts",
  "src/lib/markets/tests/calendar/capturePersistence.test.ts",
  "src/lib/markets/tests/calendar/captureArchive.test.ts",
  "src/lib/markets/tests/calendar/r2CaptureArchiveConfig.test.ts",
  "src/lib/markets/tests/calendar/r2CaptureArchiveTransport.test.ts",
  "src/lib/markets/tests/calendar/r2CaptureArchiveQualification.test.ts",
  "src/lib/markets/tests/calendar/r2QualificationApproval.test.ts",
  "src/lib/markets/tests/calendar/r2QualificationApprovalAuthority.test.ts",
  "src/lib/markets/tests/calendar/r2QualificationApprovalAuthorityStoreValidation.test.ts",
  "src/lib/markets/tests/calendar/contracts.test.ts",
  "src/lib/markets/tests/calendar/projections.test.ts",
].map(path => new URL(path, root).href));

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (allowed.has(context.parentURL) && specifier.startsWith(".")) {
      const target = new URL(specifier.endsWith(".ts") ? specifier : specifier + ".ts", context.parentURL).href;
      if (!allowed.has(target)) throw new Error("Calendar offline test dependency is outside the explicit allowlist.");
      return nextResolve(target, context);
    }
    return nextResolve(specifier, context);
  },
});

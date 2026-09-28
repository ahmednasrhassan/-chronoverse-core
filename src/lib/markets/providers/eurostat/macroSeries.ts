import {
  CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
  normalizeCanonicalStatisticalSeriesV1,
  type CanonicalStatisticalFrequencyV1,
  type CanonicalStatisticalObservationValueV1,
  type CanonicalStatisticalSeriesV1,
} from "../../services/canonicalObservationSeries";
import {
  EUROSTAT_STATISTICS_API_DATA_BASE_URL_V1,
  eurostatClientV1,
  type EurostatDatasetLoaderV1,
} from "./client";

export type EurostatEuroAreaMacroFamilyV1 = "hicp" | "gdp";

export interface EurostatEuroAreaMacroSourceSpecV1 {
  readonly datasetCode: string;
  readonly selectors: Readonly<Record<string, string>>;
  readonly dimensionIds: readonly string[];
  readonly frequency: CanonicalStatisticalFrequencyV1;
  readonly canonicalSeriesId: string;
  readonly sourceSeriesId: string;
  readonly sourceUrl: string;
  readonly unit: string;
}

export interface LoadEurostatEuroAreaMacroSeriesOptionsV1 {
  /** Explicit Unix seconds at which Chronoverse obtained this source state. */
  readonly fetchedAt: number;
  readonly loadDataset?: EurostatDatasetLoaderV1;
}

const sourceSpecs = {
  hicp: createSourceSpec({
    datasetCode: "prc_hicp_minr",
    selectorEntries: [
      ["freq", "M"],
      ["unit", "RCH_A"],
      ["coicop18", "TOTAL"],
      ["geo", "EA"],
    ],
    frequency: "monthly",
    canonicalSeriesId: "euro-area-hicp-all-items-annual-rate",
    unit: "RCH_A",
  }),
  gdp: createSourceSpec({
    datasetCode: "namq_10_gdp",
    selectorEntries: [
      ["freq", "Q"],
      ["unit", "CLV_PCH_PRE"],
      ["s_adj", "SCA"],
      ["na_item", "B1GQ"],
      ["geo", "EA"],
    ],
    frequency: "quarterly",
    canonicalSeriesId: "euro-area-real-gdp-qoq-sca",
    unit: "CLV_PCH_PRE",
  }),
} as const satisfies Record<
  EurostatEuroAreaMacroFamilyV1,
  EurostatEuroAreaMacroSourceSpecV1
>;

export const EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1 = Object.freeze(
  sourceSpecs,
);

export async function loadEurostatEuroAreaMacroSeriesV1(
  family: EurostatEuroAreaMacroFamilyV1,
  options: LoadEurostatEuroAreaMacroSeriesOptionsV1,
): Promise<CanonicalStatisticalSeriesV1> {
  if (!Number.isSafeInteger(options.fetchedAt) || options.fetchedAt < 0) {
    throw new TypeError("Eurostat macro-series fetchedAt is invalid.");
  }

  if (!Object.prototype.hasOwnProperty.call(sourceSpecs, family)) {
    throw new TypeError("Eurostat macro family is invalid.");
  }

  const spec = sourceSpecs[family];
  const loadDataset = options.loadDataset ?? ((sourceUrl) =>
    eurostatClientV1.getDataset(sourceUrl));
  const result = await loadDataset(spec.sourceUrl);

  if (result.sourceUrl !== spec.sourceUrl) {
    throw new TypeError("Eurostat dataset source URL identity is invalid.");
  }

  const parsed = parseEurostatDataset(result.payload, spec);

  return normalizeCanonicalStatisticalSeriesV1({
    observations: parsed.observations,
    metadata: {
      provenanceVersion: CANONICAL_OBSERVATION_PROVENANCE_VERSION_V1,
      provider: "eurostat",
      source: "Eurostat Statistics API",
      originalPublisher: "Eurostat",
      substitution: { status: "none" },
      canonicalSeriesId: spec.canonicalSeriesId,
      sourceSeriesId: spec.sourceSeriesId,
      sourceUrl: spec.sourceUrl,
      sourceVersionId: `eurostat:${spec.datasetCode}:${parsed.updated}`,
      frequency: spec.frequency,
      fetchedAt: options.fetchedAt,
      unit: spec.unit,
    },
  });
}

interface SourceSpecInput {
  readonly datasetCode: string;
  readonly selectorEntries: readonly (readonly [string, string])[];
  readonly frequency: CanonicalStatisticalFrequencyV1;
  readonly canonicalSeriesId: string;
  readonly unit: string;
}

function createSourceSpec(
  input: SourceSpecInput,
): EurostatEuroAreaMacroSourceSpecV1 {
  const selectors = Object.freeze(
    Object.fromEntries(input.selectorEntries),
  ) as Readonly<Record<string, string>>;
  const dimensionIds = Object.freeze([
    ...input.selectorEntries.map(([dimensionId]) => dimensionId),
    "time",
  ]);
  const sourceSeriesId = [
    input.datasetCode,
    ...input.selectorEntries.map(([dimensionId, categoryId]) =>
      `${dimensionId}=${categoryId}`
    ),
  ].join("|");
  const sourceUrl = new URL(
    `${EUROSTAT_STATISTICS_API_DATA_BASE_URL_V1}/${input.datasetCode}`,
  );
  sourceUrl.searchParams.append("lang", "EN");
  for (const [dimensionId, categoryId] of input.selectorEntries) {
    sourceUrl.searchParams.append(dimensionId, categoryId);
  }

  return Object.freeze({
    datasetCode: input.datasetCode,
    selectors,
    dimensionIds,
    frequency: input.frequency,
    canonicalSeriesId: input.canonicalSeriesId,
    sourceSeriesId,
    sourceUrl: sourceUrl.toString(),
    unit: input.unit,
  });
}

interface ParsedEurostatDataset {
  readonly updated: string;
  readonly observations: readonly CanonicalStatisticalObservationValueV1[];
}

function parseEurostatDataset(
  payload: unknown,
  spec: EurostatEuroAreaMacroSourceSpecV1,
): ParsedEurostatDataset {
  if (!isRecord(payload)) {
    throw new TypeError("Eurostat JSON-stat dataset must be an object.");
  }
  if (payload.version !== "2.0") {
    throw new TypeError("Eurostat JSON-stat version is invalid.");
  }
  if (payload.class !== "dataset") {
    throw new TypeError("Eurostat JSON-stat class is invalid.");
  }
  if (payload.source !== "ESTAT") {
    throw new TypeError("Eurostat JSON-stat source is invalid.");
  }

  const updated = parseUpdated(payload.updated);
  const dimensions = parseDimensionIdentity(payload.id, payload.size, spec);

  if (!isRecord(payload.dimension)) {
    throw new TypeError("Eurostat JSON-stat dimension object is invalid.");
  }

  const dimensionKeys = Object.keys(payload.dimension);
  if (!sameSet(dimensionKeys, dimensions.ids)) {
    throw new TypeError("Eurostat JSON-stat dimension entries are invalid.");
  }

  const categoryPositions = new Map<string, ReadonlyMap<string, number>>();
  for (const [index, dimensionId] of dimensions.ids.entries()) {
    const dimension = payload.dimension[dimensionId];
    if (!isRecord(dimension) || !isRecord(dimension.category)) {
      throw new TypeError(
        `Eurostat JSON-stat ${dimensionId} dimension is invalid.`,
      );
    }

    const positions = parseCategoryIndex(
      dimension.category.index,
      dimensions.sizes[index]!,
      dimensionId,
    );
    categoryPositions.set(dimensionId, positions);

    if (dimensionId === "time") {
      validateTimeCategories(positions, spec.frequency);
    } else {
      const expectedCategory = spec.selectors[dimensionId];
      if (
        expectedCategory === undefined ||
        positions.size !== 1 ||
        positions.get(expectedCategory) !== 0
      ) {
        throw new TypeError(
          `Eurostat JSON-stat ${dimensionId} category is invalid.`,
        );
      }
    }
  }

  const totalCells = dimensions.sizes.reduce((total, size) => {
    const next = total * size;
    if (!Number.isSafeInteger(next)) {
      throw new TypeError("Eurostat JSON-stat dataset shape is too large.");
    }
    return next;
  }, 1);
  const values = parseIndexedCells(payload.value, totalCells, "value");
  const statuses = payload.status === undefined
    ? undefined
    : parseIndexedCells(payload.status, totalCells, "status");
  const timePositions = categoryPositions.get("time");
  if (timePositions === undefined) {
    throw new TypeError("Eurostat JSON-stat time dimension is missing.");
  }

  const observations: CanonicalStatisticalObservationValueV1[] = [];
  for (const [referencePeriod, timePosition] of timePositions) {
    const flatIndex = calculateFlatIndex(
      dimensions.ids,
      dimensions.sizes,
      categoryPositions,
      spec.selectors,
      timePosition,
    );
    const valueCell = readIndexedCell(values, flatIndex);
    const statusCell = statuses === undefined
      ? { present: false as const, value: undefined }
      : readIndexedCell(statuses, flatIndex);
    const officialStatus = statusCell.present
      ? parseOfficialStatus(statusCell.value)
      : undefined;

    if (!valueCell.present || isUnavailableValue(valueCell.value)) {
      if (officialStatus !== undefined && officialStatus !== ":") {
        throw new TypeError(
          "Eurostat JSON-stat observation status has no value.",
        );
      }
      continue;
    }
    if (officialStatus === ":") {
      throw new TypeError(
        "Eurostat JSON-stat observation value contradicts unavailable status.",
      );
    }
    if (typeof valueCell.value !== "number" || !Number.isFinite(valueCell.value)) {
      throw new TypeError("Eurostat JSON-stat observation value is invalid.");
    }

    observations.push({
      referencePeriod,
      value: valueCell.value,
      ...(officialStatus === undefined ? {} : { officialStatus }),
    });
  }

  return Object.freeze({
    updated,
    observations: Object.freeze(observations),
  });
}

interface ParsedDimensionIdentity {
  readonly ids: readonly string[];
  readonly sizes: readonly number[];
}

function parseDimensionIdentity(
  rawIds: unknown,
  rawSizes: unknown,
  spec: EurostatEuroAreaMacroSourceSpecV1,
): ParsedDimensionIdentity {
  if (!Array.isArray(rawIds) || !Array.isArray(rawSizes)) {
    throw new TypeError("Eurostat JSON-stat dimension identity is invalid.");
  }
  if (rawIds.length !== rawSizes.length || rawIds.length === 0) {
    throw new TypeError("Eurostat JSON-stat dimension shape is invalid.");
  }
  if (
    rawIds.some((id) =>
      typeof id !== "string" || id.length === 0 || id !== id.trim()
    ) ||
    new Set(rawIds).size !== rawIds.length
  ) {
    throw new TypeError("Eurostat JSON-stat dimension IDs are invalid.");
  }
  if (
    rawSizes.some((size) => !Number.isSafeInteger(size) || size <= 0)
  ) {
    throw new TypeError("Eurostat JSON-stat dimension sizes are invalid.");
  }

  const ids = rawIds as string[];
  const sizes = rawSizes as number[];
  if (!sameSet(ids, spec.dimensionIds)) {
    throw new TypeError("Eurostat JSON-stat dimension set is invalid.");
  }

  for (const [index, dimensionId] of ids.entries()) {
    if (dimensionId !== "time" && sizes[index] !== 1) {
      throw new TypeError(
        `Eurostat JSON-stat ${dimensionId} dimension must contain one category.`,
      );
    }
  }

  return Object.freeze({
    ids: Object.freeze([...ids]),
    sizes: Object.freeze([...sizes]),
  });
}

function parseCategoryIndex(
  rawIndex: unknown,
  expectedSize: number,
  dimensionId: string,
): ReadonlyMap<string, number> {
  const entries: Array<readonly [string, number]> = Array.isArray(rawIndex)
    ? rawIndex.map((categoryId, position) => {
        if (
          typeof categoryId !== "string" ||
          categoryId.length === 0 ||
          categoryId !== categoryId.trim()
        ) {
          throw new TypeError(
            `Eurostat JSON-stat ${dimensionId} category index is invalid.`,
          );
        }
        return [categoryId, position] as const;
      })
    : isRecord(rawIndex)
      ? Object.entries(rawIndex).map(([categoryId, position]) => {
          if (
            categoryId.length === 0 ||
            categoryId !== categoryId.trim() ||
            !Number.isSafeInteger(position) ||
            (position as number) < 0
          ) {
            throw new TypeError(
              `Eurostat JSON-stat ${dimensionId} category index is invalid.`,
            );
          }
          return [categoryId, position as number] as const;
        })
      : invalidCategoryIndex(dimensionId);

  const positions = new Map(entries);
  const numericPositions = entries.map(([, position]) => position);
  if (
    entries.length !== expectedSize ||
    positions.size !== expectedSize ||
    new Set(numericPositions).size !== expectedSize ||
    numericPositions.some((position) => position >= expectedSize) ||
    !Array.from({ length: expectedSize }, (_, position) => position).every(
      (position) => numericPositions.includes(position),
    )
  ) {
    throw new TypeError(
      `Eurostat JSON-stat ${dimensionId} category index is invalid.`,
    );
  }

  return positions;
}

function invalidCategoryIndex(dimensionId: string): never {
  throw new TypeError(
    `Eurostat JSON-stat ${dimensionId} category index is invalid.`,
  );
}

function validateTimeCategories(
  positions: ReadonlyMap<string, number>,
  frequency: CanonicalStatisticalFrequencyV1,
): void {
  const periodPattern = frequency === "monthly"
    ? /^\d{4}-(?:0[1-9]|1[0-2])$/
    : /^\d{4}-Q[1-4]$/;

  if (
    positions.size === 0 ||
    [...positions.keys()].some((referencePeriod) =>
      !periodPattern.test(referencePeriod)
    )
  ) {
    throw new TypeError("Eurostat JSON-stat time categories are invalid.");
  }
}

type IndexedCells = readonly unknown[] | Readonly<Record<string, unknown>>;

function parseIndexedCells(
  value: unknown,
  totalCells: number,
  label: "value" | "status",
): IndexedCells {
  if (Array.isArray(value)) {
    if (
      value.length !== totalCells ||
      Array.from({ length: totalCells }, (_, index) => index).some(
        (index) => !Object.prototype.hasOwnProperty.call(value, index),
      )
    ) {
      throw new TypeError(`Eurostat JSON-stat ${label} shape is invalid.`);
    }
    return value;
  }
  if (!isRecord(value)) {
    throw new TypeError(`Eurostat JSON-stat ${label} shape is invalid.`);
  }

  for (const key of Object.keys(value)) {
    if (!/^(?:0|[1-9]\d*)$/.test(key)) {
      throw new TypeError(`Eurostat JSON-stat ${label} index is invalid.`);
    }
    const index = Number(key);
    if (!Number.isSafeInteger(index) || index >= totalCells) {
      throw new TypeError(`Eurostat JSON-stat ${label} index is invalid.`);
    }
  }
  return value;
}

function readIndexedCell(
  cells: IndexedCells,
  index: number,
): { readonly present: boolean; readonly value: unknown } {
  const key = String(index);
  if (Array.isArray(cells)) {
    return Object.prototype.hasOwnProperty.call(cells, key)
      ? { present: true, value: cells[index] }
      : { present: false, value: undefined };
  }

  const sparseCells = cells as Readonly<Record<string, unknown>>;
  return Object.prototype.hasOwnProperty.call(sparseCells, key)
    ? { present: true, value: sparseCells[key] }
    : { present: false, value: undefined };
}

function calculateFlatIndex(
  dimensionIds: readonly string[],
  sizes: readonly number[],
  categoryPositions: ReadonlyMap<string, ReadonlyMap<string, number>>,
  selectors: Readonly<Record<string, string>>,
  timePosition: number,
): number {
  let flatIndex = 0;

  for (const [index, dimensionId] of dimensionIds.entries()) {
    const coordinate = dimensionId === "time"
      ? timePosition
      : categoryPositions.get(dimensionId)?.get(selectors[dimensionId]!);
    if (coordinate === undefined) {
      throw new TypeError("Eurostat JSON-stat coordinates are invalid.");
    }
    flatIndex = flatIndex * sizes[index]! + coordinate;
  }

  return flatIndex;
}

function parseOfficialStatus(value: unknown): string | undefined {
  if (value === null || value === "") return undefined;
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value !== value.trim()
  ) {
    throw new TypeError("Eurostat JSON-stat observation status is invalid.");
  }
  return value;
}

function isUnavailableValue(value: unknown): boolean {
  return value === null || value === ":";
}

function parseUpdated(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value !== value.trim() ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:Z|[+-]\d{2}:?\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  ) {
    throw new TypeError("Eurostat JSON-stat updated timestamp is invalid.");
  }
  return value;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length &&
    new Set(left).size === left.length &&
    left.every((value) => right.includes(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

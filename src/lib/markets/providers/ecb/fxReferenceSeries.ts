import {
  normalizeCanonicalObservationSeriesV1,
  type CanonicalObservationSeriesV1,
  type CanonicalObservationValueV1,
} from "../../services/canonicalObservationSeries";
import { ecbClientV1 } from "./client";
import type {
  EcbFxReferenceDataResultV1,
  EcbFxReferenceProductIdV1,
  EcbFxReferenceProductV1,
  EcbFxReferenceRawObservationV1,
} from "./types";

const products = {
  eurusd: {
    canonicalProductId: "eurusd",
    ecbSeriesKey: "D.USD.EUR.SP00.A",
    seriesId: "EXR.D.USD.EUR.SP00.A",
    quoteCurrency: "USD",
    displayName: "EUR/USD",
    quotation: "EUR 1 = X USD",
    unit: "USD per EUR",
    inverted: false,
  },
  eurjpy: {
    canonicalProductId: "eurjpy",
    ecbSeriesKey: "D.JPY.EUR.SP00.A",
    seriesId: "EXR.D.JPY.EUR.SP00.A",
    quoteCurrency: "JPY",
    displayName: "EUR/JPY",
    quotation: "EUR 1 = X JPY",
    unit: "JPY per EUR",
    inverted: false,
  },
  eurgbp: {
    canonicalProductId: "eurgbp",
    ecbSeriesKey: "D.GBP.EUR.SP00.A",
    seriesId: "EXR.D.GBP.EUR.SP00.A",
    quoteCurrency: "GBP",
    displayName: "EUR/GBP",
    quotation: "EUR 1 = X GBP",
    unit: "GBP per EUR",
    inverted: false,
  },
  eurchf: {
    canonicalProductId: "eurchf",
    ecbSeriesKey: "D.CHF.EUR.SP00.A",
    seriesId: "EXR.D.CHF.EUR.SP00.A",
    quoteCurrency: "CHF",
    displayName: "EUR/CHF",
    quotation: "EUR 1 = X CHF",
    unit: "CHF per EUR",
    inverted: false,
  },
} as const satisfies Record<EcbFxReferenceProductIdV1, EcbFxReferenceProductV1>;

export const ECB_FX_REFERENCE_PRODUCTS_V1 = Object.freeze(
  Object.fromEntries(
    Object.entries(products).map(([productId, product]) => [
      productId,
      Object.freeze(product),
    ]),
  ),
) as Readonly<Record<EcbFxReferenceProductIdV1, EcbFxReferenceProductV1>>;

export const ECB_FX_REFERENCE_PRODUCT_IDS_V1 = Object.freeze(
  Object.keys(ECB_FX_REFERENCE_PRODUCTS_V1) as EcbFxReferenceProductIdV1[],
);

export type EcbFxReferenceSeriesBundleV1 = Readonly<
  Record<EcbFxReferenceProductIdV1, CanonicalObservationSeriesV1>
>;

export interface EcbFxReferenceSeriesDependenciesV1 {
  readonly loadData?: (
    seriesIds: readonly string[],
  ) => Promise<EcbFxReferenceDataResultV1>;
  readonly now?: () => Date;
}

/** One acquisition produces an atomic canonical bundle for all launch FX pairs. */
export async function loadEcbFxReferenceSeriesBundleV1(
  dependencies: EcbFxReferenceSeriesDependenciesV1 = {},
): Promise<EcbFxReferenceSeriesBundleV1> {
  const seriesIds = ECB_FX_REFERENCE_PRODUCT_IDS_V1.map(
    (productId) => ECB_FX_REFERENCE_PRODUCTS_V1[productId].seriesId,
  );
  const result = await (dependencies.loadData ?? ((requestedSeriesIds) =>
    ecbClientV1.getFxReferenceRates(requestedSeriesIds)))(seriesIds);

  validateResultIdentity(result, seriesIds);

  const fetchedAt = Math.floor(
    (dependencies.now ?? (() => new Date()))().getTime() / 1000,
  );
  const entries = ECB_FX_REFERENCE_PRODUCT_IDS_V1.map((productId) => {
    const product = ECB_FX_REFERENCE_PRODUCTS_V1[productId];
    const observations = normalizeProductObservations(
      result.observations.filter((item) => item.seriesId === product.seriesId),
      product,
    );

    if (observations.length === 0) {
      throw new TypeError(
        `[Chronoverse ECB] ${product.displayName} contains no valid observations.`,
      );
    }

    const sourceTimestamp = observations.at(-1)!.timestamp;
    const series = normalizeCanonicalObservationSeriesV1({
      observations,
      metadata: {
        provider: "ecb",
        source: "European Central Bank",
        seriesId: product.seriesId,
        requestedProductId: productId,
        canonicalProductId: product.canonicalProductId,
        interval: "1d",
        fetchedAt,
        sourceTimestamp,
        status: "end_of_day",
        unit: product.unit,
        seriesKind: "reference-rate",
      },
    });

    return [productId, series] as const;
  });

  return Object.freeze(Object.fromEntries(entries)) as EcbFxReferenceSeriesBundleV1;
}

export function selectEcbFxReferenceSeriesV1(
  bundle: EcbFxReferenceSeriesBundleV1,
  productId: EcbFxReferenceProductIdV1,
): CanonicalObservationSeriesV1 {
  if (!Object.prototype.hasOwnProperty.call(ECB_FX_REFERENCE_PRODUCTS_V1, productId)) {
    throw new TypeError("ECB FX reference product ID is invalid.");
  }

  const series = bundle[productId];

  if (
    series === undefined ||
    series.metadata.canonicalProductId !== productId ||
    series.metadata.seriesId !== ECB_FX_REFERENCE_PRODUCTS_V1[productId].seriesId
  ) {
    throw new TypeError("ECB FX reference bundle identity is inconsistent.");
  }

  return series;
}

function validateResultIdentity(
  result: EcbFxReferenceDataResultV1,
  expectedSeriesIds: readonly string[],
): void {
  if (result.provider !== "ecb") {
    throw new TypeError("ECB FX reference provider identity is invalid.");
  }

  const expected = [...expectedSeriesIds].sort();
  const received = [...result.requestedSeriesIds].sort();

  if (
    expected.length !== received.length ||
    expected.some((seriesId, index) => seriesId !== received[index])
  ) {
    throw new TypeError("ECB FX reference request identity is invalid.");
  }

  const allowed = new Set(expectedSeriesIds);

  if (result.observations.some((item) => !allowed.has(item.seriesId))) {
    throw new TypeError("ECB FX reference response contains an unexpected series.");
  }
}

function normalizeProductObservations(
  raw: readonly EcbFxReferenceRawObservationV1[],
  product: EcbFxReferenceProductV1,
): readonly CanonicalObservationValueV1[] {
  return raw.flatMap((item) => {
    if (item.seriesId !== product.seriesId) {
      throw new TypeError("ECB FX reference observation identity is invalid.");
    }

    const timestamp = parseEcbDailyPeriod(item.period);

    if (item.value === "") {
      return [];
    }

    const value = Number(item.value);

    if (!Number.isFinite(value) || value <= 0) {
      throw new TypeError("ECB FX reference observation value is invalid.");
    }

    return [{ timestamp, value }];
  });
}

function parseEcbDailyPeriod(period: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(period);

  if (match === null) {
    throw new TypeError("ECB FX reference observation date is invalid.");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day) / 1000;
  const date = new Date(timestamp * 1000);

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new TypeError("ECB FX reference observation date is invalid.");
  }

  return timestamp;
}

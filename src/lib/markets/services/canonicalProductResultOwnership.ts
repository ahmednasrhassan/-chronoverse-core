export type CanonicalProductIdV1 =
  | "eurusd"
  | "eurjpy"
  | "eurgbp"
  | "eurchf"
  | "estr";

type CanonicalProductResultMapConstraintV1 = Readonly<
  Record<CanonicalProductIdV1, unknown>
>;

export type CanonicalProductRuntimeLoadersV1<
  TResultMap extends CanonicalProductResultMapConstraintV1,
> = {
  readonly [TProductId in CanonicalProductIdV1]:
    () => Promise<TResultMap[TProductId]>;
};

export interface CanonicalProductResultOwnerV1<
  TResultMap extends CanonicalProductResultMapConstraintV1,
> {
  readonly get: <TProductId extends CanonicalProductIdV1>(
    productId: TProductId,
  ) => Promise<TResultMap[TProductId]>;
}

/**
 * Creates one product-keyed retrieval owner over existing result loaders.
 * The injected loaders retain ownership of any shared server cache topology.
 */
export function createCanonicalProductResultOwnerV1<
  TResultMap extends CanonicalProductResultMapConstraintV1,
>(
  loaders: CanonicalProductRuntimeLoadersV1<TResultMap>,
): CanonicalProductResultOwnerV1<TResultMap> {
  return Object.freeze({
    get: <TProductId extends CanonicalProductIdV1>(
      productId: TProductId,
    ): Promise<TResultMap[TProductId]> =>
      loaders[productId]() as Promise<TResultMap[TProductId]>,
  });
}

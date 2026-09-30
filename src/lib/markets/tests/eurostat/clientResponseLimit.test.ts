import assert from "node:assert/strict";

import {
  EUROSTAT_MAX_RESPONSE_BYTES_V1,
  EurostatClientV1,
  EurostatResponseTooLargeError,
  EurostatTransportError,
} from "../../providers/eurostat/client";
import { EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1 } from
  "../../providers/eurostat/macroSeries";

const sourceUrl = EUROSTAT_EURO_AREA_MACRO_SOURCE_SPECS_V1.hicp.sourceUrl;
const jsonHeaders = { "content-type": "application/json" };

function response(
  chunks: readonly Uint8Array[],
  declaredLength?: string,
): Response {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  }), {
    status: 200,
    headers: {
      ...jsonHeaders,
      ...(declaredLength === undefined ? {} : { "content-length": declaredLength }),
    },
  });
}

async function rejectsWith(
  result: Promise<unknown>,
  expected: RegExp | (new (...args: never[]) => Error),
): Promise<void> {
  await assert.rejects(result, expected);
}

async function sizeBoundaries(): Promise<void> {
  assert.equal(EUROSTAT_MAX_RESPONSE_BYTES_V1, 5 * 1024 * 1024);

  const declared = new EurostatClientV1({
    fetchImpl: async () => response(
      [new TextEncoder().encode("{}")],
      String(EUROSTAT_MAX_RESPONSE_BYTES_V1 + 1),
    ),
  });
  await rejectsWith(declared.getDataset(sourceUrl), EurostatResponseTooLargeError);

  for (const length of [undefined, "1"]) {
    const actual = new EurostatClientV1({
      fetchImpl: async () => response(
        [new Uint8Array(EUROSTAT_MAX_RESPONSE_BYTES_V1), Uint8Array.of(1)],
        length,
      ),
    });
    await rejectsWith(actual.getDataset(sourceUrl), EurostatResponseTooLargeError);
  }

  let cancelled = 0;
  const singleChunk = new EurostatClientV1({
    fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(EUROSTAT_MAX_RESPONSE_BYTES_V1 + 1));
      },
      cancel() { cancelled += 1; },
    }), { headers: jsonHeaders }),
  });
  await rejectsWith(singleChunk.getDataset(sourceUrl), EurostatResponseTooLargeError);
  assert.equal(cancelled, 1, "oversized unfinished stream is cancelled");

  const exactJson = `"${"a".repeat(EUROSTAT_MAX_RESPONSE_BYTES_V1 - 2)}"`;
  const encoded = new TextEncoder().encode(exactJson);
  assert.equal(encoded.byteLength, EUROSTAT_MAX_RESPONSE_BYTES_V1);
  const exactLimit = new EurostatClientV1({
    fetchImpl: async () => response([encoded], String(encoded.byteLength)),
  });
  assert.equal((await exactLimit.getDataset(sourceUrl)).payload, "a".repeat(
    EUROSTAT_MAX_RESPONSE_BYTES_V1 - 2,
  ));
}

async function malformedBodies(): Promise<void> {
  for (const invalidLength of ["-1", "1.5", "01"]) {
    const client = new EurostatClientV1({
      fetchImpl: async () => response([new TextEncoder().encode("{}")], invalidLength),
    });
    await rejectsWith(client.getDataset(sourceUrl), /content length is invalid/);
  }

  const nullBody = new EurostatClientV1({
    fetchImpl: async () => new Response(null, { headers: jsonHeaders }),
  });
  await rejectsWith(nullBody.getDataset(sourceUrl), /Response JSON is invalid/);

  for (const body of ["", '{"a":']) {
    const client = new EurostatClientV1({
      fetchImpl: async () => new Response(body, { headers: jsonHeaders }),
    });
    await rejectsWith(client.getDataset(sourceUrl), /Response JSON is invalid/);
  }

  const invalidUtf8 = new EurostatClientV1({
    fetchImpl: async () => response([Uint8Array.of(0xc3, 0x28)]),
  });
  await rejectsWith(invalidUtf8.getDataset(sourceUrl), /Response JSON is invalid/);
}

async function cleanup(): Promise<void> {
  let cancelled = 0;
  let requestSignal: AbortSignal | undefined;
  const early = new EurostatClientV1({
    fetchImpl: async (_url, init) => {
      requestSignal = init?.signal ?? undefined;
      return new Response(new ReadableStream<Uint8Array>({
        cancel() { cancelled += 1; },
      }), { headers: { ...jsonHeaders, "content-length": "bad" } });
    },
  });
  await rejectsWith(early.getDataset(sourceUrl), /content length is invalid/);
  assert.equal(cancelled, 1, "early header rejection cancels the body");
  assert.equal(requestSignal?.aborted, true);

  const failedHttp = new EurostatClientV1({
    fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
      cancel() { cancelled += 1; },
    }), { status: 503, headers: jsonHeaders }),
  });
  await rejectsWith(failedHttp.getDataset(sourceUrl), /HTTP 503/);
  assert.equal(cancelled, 2, "HTTP rejection cancels the body");

  const cleanupError = new Error("cancel failed");
  const failedCleanup = new EurostatClientV1({
    fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
      cancel() { throw cleanupError; },
    }), { headers: { ...jsonHeaders, "content-length": "bad" } }),
  });
  await rejectsWith(failedCleanup.getDataset(sourceUrl), /content length is invalid/);

  const failedReaderCleanup = new EurostatClientV1({
    fetchImpl: async () => new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(EUROSTAT_MAX_RESPONSE_BYTES_V1 + 1));
      },
      cancel() { throw cleanupError; },
    }), { headers: jsonHeaders }),
  });
  await rejectsWith(failedReaderCleanup.getDataset(sourceUrl),
    EurostatResponseTooLargeError);

  const readError = new Error("stream read failed");
  let readSignal: AbortSignal | undefined;
  let readResponse: Response | undefined;
  const failedRead = new EurostatClientV1({
    fetchImpl: async (_url, init) => {
      readSignal = init?.signal ?? undefined;
      readResponse = new Response(new ReadableStream<Uint8Array>({
        pull() { throw readError; },
      }), { headers: jsonHeaders });
      return readResponse;
    },
  });
  await assert.rejects(failedRead.getDataset(sourceUrl), (error) =>
    error instanceof EurostatTransportError &&
    error.code === "body-read" && error.originalError === readError);
  assert.equal(readSignal?.aborted, true);
  assert.equal(readResponse?.body?.locked, false);
}

async function timeouts(): Promise<void> {
  const headerError = new Error("header fetch aborted");
  const headerTimeout = new EurostatClientV1({
    timeoutMs: 5,
    fetchImpl: async (_url, init) => new Promise<Response>((_resolve, reject) => {
      (init?.signal as AbortSignal).addEventListener("abort", () => {
        reject(headerError);
      }, { once: true });
    }),
  });
  await assert.rejects(headerTimeout.getDataset(sourceUrl), (error) =>
    error instanceof EurostatTransportError &&
    error.code === "timeout" && error.originalError === headerError);

  const bodyError = new Error("body read aborted");
  let bodyResponse: Response | undefined;
  const bodyTimeout = new EurostatClientV1({
    timeoutMs: 5,
    fetchImpl: async (_url, init) => {
      bodyResponse = new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          (init?.signal as AbortSignal).addEventListener("abort", () => {
            controller.error(bodyError);
          }, { once: true });
        },
      }), { headers: jsonHeaders });
      return bodyResponse;
    },
  });
  await assert.rejects(bodyTimeout.getDataset(sourceUrl), (error) =>
    error instanceof EurostatTransportError &&
    error.code === "timeout" && error.originalError === bodyError);
  assert.equal(bodyResponse?.body?.locked, false);
}

async function networkClassification(): Promise<void> {
  const originalFetch = globalThis.fetch;
  const networkError = new TypeError("simulated network rejection");
  globalThis.fetch = async () => { throw networkError; };
  try {
    const client = new EurostatClientV1();
    await assert.rejects(client.getDataset(sourceUrl), (error) =>
      error instanceof EurostatTransportError &&
      error.code === "network" && error.originalError === networkError);
  } finally {
    globalThis.fetch = originalFetch;
  }

  const programmingError = new ReferenceError("fake transport bug");
  const injected = new EurostatClientV1({
    fetchImpl: async () => { throw programmingError; },
  });
  await assert.rejects(injected.getDataset(sourceUrl),
    (error) => error === programmingError);
}

async function main(): Promise<void> {
  await sizeBoundaries();
  await malformedBodies();
  await cleanup();
  await timeouts();
  await networkClassification();
  console.log("PASS: Eurostat response size and cleanup V1");
}

void main();

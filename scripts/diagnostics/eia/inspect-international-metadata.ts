import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

async function main() {
  loadEnvConfig(process.cwd());

  console.log(
    "EIA INTERNATIONAL METADATA TEST",
  );

  const apiKey =
    process.env.EIA_API_KEY;

  if (!apiKey) {
    throw new Error(
      "EIA_API_KEY is not loaded.",
    );
  }

  const url =
    new URL(
      "https://api.eia.gov/v2/international/",
    );

  url.searchParams.set(
    "api_key",
    apiKey,
  );

  const response =
    await fetch(url, {
      headers: {
        Accept:
          "application/json",
      },
    });

  console.log(
    "HTTP STATUS:",
    response.status,
  );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      [
        "EIA metadata request failed.",
        `HTTP ${response.status}.`,
        text
          ? `Response: ${text.slice(0, 300)}`
          : "",
      ]
        .filter(Boolean)
        .join(" "),
    );
  }

  const data =
    (await response.json()) as {
      response?: {
        id?: string;
        name?: string;
        description?: string;
        frequency?: unknown;
        facets?: unknown;
        data?: unknown;
        startPeriod?: string;
        endPeriod?: string;
        defaultDateFormat?: string;
        defaultFrequency?: string;
      };
      apiVersion?: string;
      ExcelAddInVersion?: string;
    };

  console.dir(
    {
      response:
        data.response,
      apiVersion:
        data.apiVersion,
      ExcelAddInVersion:
        data.ExcelAddInVersion,
    },
    {
      depth: 10,
    },
  );

  console.log(
    "PASS: EIA international metadata works",
  );
}

const isDirectExecution =
  process.argv[1] !== undefined &&
  import.meta.url ===
    pathToFileURL(
      resolve(process.argv[1]),
    ).href;

if (isDirectExecution) {
  main().catch(
    (error) => {
      console.error(error);
      process.exit(1);
    },
  );
}

export function parseEcbCsv(
  payload: string,
): readonly (readonly string[])[] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < payload.length; index += 1) {
    const character = payload[index]!;

    if (quoted) {
      if (character === "\"") {
        if (payload[index + 1] === "\"") {
          field += "\"";
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += character;
      }

      continue;
    }

    if (character === "\"") {
      if (field.length !== 0) {
        throw new TypeError("[Chronoverse ECB] CSV quoting is invalid.");
      }

      quoted = true;
    } else if (character === ",") {
      record.push(field);
      field = "";
    } else if (character === "\n") {
      record.push(field.replace(/\r$/, ""));
      records.push(record);
      record = [];
      field = "";
    } else {
      field += character;
    }
  }

  if (quoted) {
    throw new TypeError("[Chronoverse ECB] CSV quote is unterminated.");
  }

  if (field.length > 0 || record.length > 0) {
    record.push(field.replace(/\r$/, ""));
    records.push(record);
  }

  return Object.freeze(records.map((item) => Object.freeze(item)));
}

export function normalizeEcbCsvHeaders(
  record: readonly string[],
): readonly string[] {
  const headers = record.map((header, index) =>
    (index === 0 ? header.replace(/^\uFEFF/, "") : header).trim());

  if (new Set(headers).size !== headers.length) {
    throw new TypeError("[Chronoverse ECB] CSV headers are duplicated.");
  }

  return Object.freeze(headers);
}

export function requireEcbCsvHeader(
  headers: readonly string[],
  name: string,
): number {
  const index = headers.indexOf(name);

  if (index === -1) {
    throw new TypeError(`[Chronoverse ECB] CSV ${name} header is invalid.`);
  }

  return index;
}

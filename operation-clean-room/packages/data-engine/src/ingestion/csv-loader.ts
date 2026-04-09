import { createReadStream } from 'node:fs';
import { parse, type Options as CSVParseOptions } from 'csv-parse';

/**
 * Options for the generic CSV loader.
 */
export interface CSVOptions {
  /** CSV delimiter character. Defaults to ','. */
  delimiter?: string;
  /** Whether the first row contains column headers. Defaults to true. */
  headers?: boolean;
  /** Skip a fixed number of initial lines (before headers). Defaults to 0. */
  skipLines?: number;
  /** Strip the UTF-8 BOM if present. Defaults to true. */
  stripBOM?: boolean;
  /** Trim whitespace from each field. Defaults to true. */
  trim?: boolean;
  /**
   * Optional transform applied to every raw record before it is returned.
   * Useful for coercing string fields to numbers, dates, etc.
   */
  transform?: (record: Record<string, string>) => unknown;
}

/**
 * Load and parse a CSV file into a typed array of records.
 *
 * Handles common real-world CSV issues:
 * - UTF-8 BOM markers
 * - Trailing commas on rows
 * - Inconsistent quoting
 * - Empty trailing rows
 *
 * @typeParam T - The target record type. Fields are coerced from strings by
 *   the optional `transform` callback; without it every value is a string.
 * @param filePath - Absolute or relative path to the CSV file.
 * @param options  - Parsing options (see {@link CSVOptions}).
 * @returns An array of parsed records.
 *
 * @example
 * ```ts
 * const payments = await loadCSV<StripePayment>('data/stripe_payments.csv', {
 *   transform: (row) => ({
 *     ...row,
 *     amount: Number(row.amount),
 *   }),
 * });
 * ```
 */
export async function loadCSV<T>(
  filePath: string,
  options: CSVOptions = {},
): Promise<T[]> {
  const {
    delimiter = ',',
    headers = true,
    skipLines = 0,
    stripBOM = true,
    trim = true,
    transform,
  } = options;

  const parseOptions: CSVParseOptions = {
    delimiter,
    columns: headers,
    from_line: skipLines + 1,
    bom: stripBOM,
    trim,
    skip_empty_lines: true,
    relax_column_count: true, // handles trailing commas
    cast: false, // we rely on the explicit transform instead
  };

  return new Promise<T[]>((resolve, reject) => {
    const records: T[] = [];

    createReadStream(filePath, { encoding: 'utf-8' })
      .pipe(parse(parseOptions))
      .on('data', (record: Record<string, string>) => {
        try {
          const transformed = transform ? transform(record) : record;
          records.push(transformed as T);
        } catch (err) {
          reject(
            new Error(
              `CSV transform error at row ${records.length + 1} in ${filePath}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            ),
          );
        }
      })
      .on('end', () => resolve(records))
      .on('error', (err) =>
        reject(new Error(`Failed to parse CSV file ${filePath}: ${err.message}`)),
      );
  });
}

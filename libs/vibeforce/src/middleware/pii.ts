/**
 * PII awareness middleware — scans SOQL query results for fields that likely
 * contain personally identifiable information and optionally masks them.
 */

import type {
  ConfirmFn,
  Middleware,
  ToolCall,
  ToolExecutor,
  ToolResult,
} from './types.js';

// ---------------------------------------------------------------------------
// PII field patterns
// ---------------------------------------------------------------------------

/**
 * Case-insensitive patterns that indicate a field likely contains PII.
 */
const PII_FIELD_PATTERNS: RegExp[] = [
  /email/i,
  /phone/i,
  /ssn/i,
  /socialsecurity/i,
  /dateofbirth/i,
  /birthdate/i,
  /address/i,
  /street/i,
  /city/i,
  /postalcode/i,
  /zipcode/i,
  /mailingaddress/i,
  /personalphone/i,
  /mobilephone/i,
  /homephone/i,
];

const MASKED_VALUE = '[MASKED]';

/**
 * Check whether a field name looks like PII.
 */
export function isPiiField(fieldName: string): boolean {
  return PII_FIELD_PATTERNS.some((p) => p.test(fieldName));
}

/**
 * Scan an object (SOQL record) for PII field names and return the list of
 * matching field names.
 */
export function detectPiiFields(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter(isPiiField);
}

/**
 * Mask PII fields in an array of SOQL records.
 */
export function maskPiiInRecords(
  records: Record<string, unknown>[],
): Record<string, unknown>[] {
  return records.map((record) => {
    const masked = { ...record };
    for (const key of Object.keys(masked)) {
      if (isPiiField(key)) {
        masked[key] = MASKED_VALUE;
      }
    }
    return masked;
  });
}

// ---------------------------------------------------------------------------
// Middleware factory
// ---------------------------------------------------------------------------

export interface PiiMiddlewareOptions {
  confirm: ConfirmFn;
}

export function createPiiMiddleware(
  options: PiiMiddlewareOptions,
): Middleware {
  const { confirm } = options;

  const middleware: Middleware = async (
    call: ToolCall,
    next: ToolExecutor,
  ): Promise<ToolResult> => {
    // Only inspect SOQL query results
    if (call.name !== 'sf_query') {
      return next(call);
    }

    const result = await next(call);

    if (!result.success || !result.data) {
      return result;
    }

    // Try to extract records from the result
    const data = result.data as { records?: Record<string, unknown>[] };
    const records = data.records;

    if (!Array.isArray(records) || records.length === 0) {
      return result;
    }

    // Collect all PII field names across records
    const piiFieldsSet = new Set<string>();
    for (const record of records) {
      for (const field of detectPiiFields(record)) {
        piiFieldsSet.add(field);
      }
    }

    if (piiFieldsSet.size === 0) {
      return result;
    }

    const piiFields = Array.from(piiFieldsSet).sort();
    const shouldMask = await confirm(
      `\u26a0 Query results contain PII fields (${piiFields.join(', ')}). ` +
        `These will be sent to the LLM API. Mask them? [y/N]`,
    );

    if (shouldMask) {
      const maskedRecords = maskPiiInRecords(records);
      return {
        ...result,
        data: { ...data, records: maskedRecords },
      };
    }

    return result;
  };

  return middleware;
}

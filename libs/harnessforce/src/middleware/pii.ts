/**
 * PII awareness — scans SOQL query results for fields that likely
 * contain personally identifiable information and optionally masks them.
 */

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
// Types (kept for backwards compatibility)
// ---------------------------------------------------------------------------

export interface PiiMiddlewareOptions {
  confirm: import('./types.js').ConfirmFn;
}

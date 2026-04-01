/**
 * Formatting utilities for Salesforce CLI command output.
 * Produces clean, aligned text tables for terminal display.
 */

/**
 * Format data as an aligned text table.
 */
export function formatTable(headers: string[], rows: string[][]): string {
  if (rows.length === 0) {
    return `${headers.join("  ")}\n(no results)`;
  }

  // Calculate column widths (minimum = header width)
  const widths = headers.map((h, i) => {
    const dataMax = Math.max(0, ...rows.map((r) => (r[i] ?? "").length));
    return Math.max(h.length, dataMax);
  });

  const headerLine = headers.map((h, i) => h.padEnd(widths[i]!)).join("  ");
  const separator = widths.map((w) => "─".repeat(w)).join("──");
  const dataLines = rows.map((row) =>
    row.map((cell, i) => (cell ?? "").padEnd(widths[i]!)).join("  "),
  );

  return [headerLine, separator, ...dataLines].join("\n");
}

/**
 * Format SOQL query results as a table.
 */
export function formatQueryResults(data: { records: any[] }): string {
  const records = data.records ?? [];
  if (records.length === 0) {
    return "Query returned 0 records.";
  }

  // Extract column names from first record, ignoring "attributes"
  const headers = Object.keys(records[0]!).filter((k) => k !== "attributes");
  const rows = records.map((rec: any) =>
    headers.map((h) => {
      const val = rec[h];
      if (val === null || val === undefined) return "";
      if (typeof val === "object") return JSON.stringify(val);
      return String(val);
    }),
  );

  const countLine = `${records.length} record${records.length === 1 ? "" : "s"} returned.`;
  return `${formatTable(headers, rows)}\n\n${countLine}`;
}

/**
 * Format sObject describe fields as a table.
 */
export function formatFieldList(fields: any[]): string {
  if (!fields || fields.length === 0) {
    return "(no fields)";
  }

  const headers = ["Name", "Type", "Required", "Reference To"];
  const rows = fields.map((f: any) => [
    f.name ?? "",
    f.type ?? "",
    f.nillable === false ? "Yes" : "",
    Array.isArray(f.referenceTo) && f.referenceTo.length > 0
      ? f.referenceTo.join(", ")
      : "",
  ]);

  return formatTable(headers, rows);
}

/**
 * Format org list data as a table.
 */
export function formatOrgInfo(data: any): string {
  // sf org list returns { scratchOrgs, nonScratchOrgs, sandboxes, ... } or similar
  const sections: string[] = [];

  const allOrgs: { alias: string; username: string; type: string; status: string }[] = [];

  const addOrgs = (list: any[] | undefined, type: string) => {
    if (!Array.isArray(list)) return;
    for (const org of list) {
      allOrgs.push({
        alias: org.alias ?? "",
        username: org.username ?? "",
        type,
        status: org.connectedStatus ?? org.status ?? "",
      });
    }
  };

  if (data && typeof data === "object") {
    addOrgs(data.nonScratchOrgs, "Production");
    addOrgs(data.scratchOrgs, "Scratch");
    addOrgs(data.sandboxes, "Sandbox");

    // Some versions of sf CLI return a flat "other" array
    if (Array.isArray(data.other)) {
      addOrgs(data.other, "Other");
    }

    // Fallback: if no recognized keys, try treating data as an array
    if (allOrgs.length === 0 && Array.isArray(data)) {
      for (const org of data) {
        allOrgs.push({
          alias: org.alias ?? "",
          username: org.username ?? "",
          type: org.isScratch ? "Scratch" : org.isSandbox ? "Sandbox" : "Production",
          status: org.connectedStatus ?? org.status ?? "",
        });
      }
    }
  }

  if (allOrgs.length === 0) {
    return "No authenticated orgs found.";
  }

  const headers = ["Alias", "Username", "Type", "Status"];
  const rows = allOrgs.map((o) => [o.alias, o.username, o.type, o.status]);
  return formatTable(headers, rows);
}

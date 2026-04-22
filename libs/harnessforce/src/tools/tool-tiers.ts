/**
 * Tool tier definitions for the request_tools meta-tool (Phase 4).
 *
 * Tier 1: Always available (~26 tools)
 * Tier 2: Loaded on demand via request_tools({ category: "..." })
 */

export const TOOL_CATEGORIES: Record<string, string[]> = {
  browser: [
    "browser_open", "browser_click", "browser_fill",
    "browser_screenshot", "browser_execute", "browser_close",
  ],
  agentforce: [
    "agent_publish", "agent_activate", "agent_validate", "agent_preview",
  ],
  "data-cloud": [
    "dc_query", "dc_list_objects", "dc_describe",
    "dc_ingest_streaming", "dc_ingest_bulk",
    "dc_create_identity_resolution", "dc_create_segment",
  ],
  "extended-sf": [
    "sf_scratch_org_create", "sf_scratch_org_delete", "sf_scratch_org_list",
    "sf_package_create", "sf_package_version_create", "sf_package_install",
    "sf_deploy_status", "sf_deploy_cancel", "sf_test_coverage",
    "sf_data_export", "sf_sandbox_create", "sf_event_log",
  ],
  discovery: [
    "sf_list_metadata_types", "sf_describe_all_sobjects", "sf_list_metadata_of_type",
  ],
  docs: [
    "sf_docs_search", "sf_docs_read",
  ],
};

export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  browser: "Browser automation — open pages, click elements, fill forms, take screenshots",
  agentforce: "Agentforce agent management — publish, activate, validate, preview agents",
  "data-cloud": "Data Cloud — query DMOs, ingest data, create identity resolution and segments",
  "extended-sf": "Extended Salesforce — scratch orgs, packages, sandboxes, deploy status, coverage",
  discovery: "Metadata discovery — list metadata types, describe all sObjects",
  docs: "Salesforce documentation — search and read SF developer docs",
};

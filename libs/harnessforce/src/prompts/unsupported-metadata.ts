/**
 * Curated list of Salesforce metadata types that have NO Metadata API support
 * and require browser automation (Playwright) to configure.
 *
 * Source: Salesforce Metadata API Developer Guide — "Unsupported Metadata Types"
 * and community knowledge of Setup-only features.
 *
 * When the agent encounters one of these types, it should automatically
 * fall back to browser automation tools instead of attempting a deploy.
 */

export const UNSUPPORTED_METADATA_TYPES = [
  // Account & Territory
  "AccountTeams",
  "Divisions",
  "TerritoryManagement",
  "TerritoryManagement2",

  // Currency & Locale
  "CurrencyExchangeRates",
  "AdvancedCurrencyManagement",
  "MultiCurrency",

  // Administration
  "DelegatedAdministration",
  "LoginAccessPolicies",
  "CertificateAndKeyManagement",
  "SessionSettings",
  "PasswordPolicies",
  "NetworkAccess",
  "LoginIpRanges",
  "LoginHours",

  // UI Layout & Navigation
  "ConsoleLayouts",
  "AppMenuItems",
  "DesktopLayoutAssignments",
  "HomePageComponents",
  "SearchLayouts",
  "SearchSettings",

  // Case & Support
  "CaseTeamRoles",
  "CaseTeamTemplates",
  "SupportSettings",
  "CaseAutoResponseRules",
  "EscalationRules",
  "BusinessHours",
  "Holidays",
  "EntitlementTemplates",
  "MilestoneTypes",
  "ServiceContracts",

  // Quotes & Products
  "QuoteTemplates",
  "PricebookEntries",
  "ProductSchedules",

  // Calendar & Activities
  "CalendarsPublic",
  "ActivitySettings",
  "PublicCalendars",

  // Tags & Social
  "TagSettings",
  "SocialAccountSettings",
  "SocialPostSettings",

  // Data Management
  "DataManagementSettings",
  "DuplicateManagement",
  "MatchingRules",
  "DataIntegrationRules",
  "StorageUsage",
  "MassDeleteRecords",
  "MassTransferRecords",

  // Forecasting
  "ForecastingSettings",
  "ForecastingTypes",
  "ForecastingDisplayedColumns",

  // Chatter
  "ChatterSettings",
  "ChatterGroups",
  "FeedTracking",

  // Mobile
  "MobileAdministration",
  "SalesforceAnywhere",
  "MobileConnectedApps",

  // Salesforce Files
  "ContentSettings",
  "LibraryPermissions",
  "ContentWorkspaces",

  // Lightning Experience
  "LightningExperienceSettings",
  "ThemingAndBranding",
  "DynamicFormsSettings",

  // Field Service
  "FieldServiceSettings",
  "FieldServiceTerritories",
  "ServiceResources",

  // Data Cloud (most config is UI-only)
  "DataCloudStreams",
  "DataCloudSegments",
  "DataCloudIdentityResolution",
  "DataCloudCalculatedInsights",
  "DataCloudActivations",
  "DataCloudDataSpaces",
  "DataCloudDataLakeObjects",

  // Analytics & Reporting
  "AnalyticSettings",
  "ReportingSettings",
  "EinsteinAnalytics",

  // Org-Wide Settings
  "CompanyInformation",
  "FiscalYear",
  "LanguageSettings",
  "OrganizationProfile",
  "FeatureSettings",

  // Miscellaneous UI-Only
  "SurveySettings",
  "NotificationTypes",
  "ActionLinkGroupTemplates",
  "ImplicitSharing",
  "ParallelApprovalRouting",
] as const;

/** Type representing any unsupported metadata type name. */
export type UnsupportedMetadataType =
  (typeof UNSUPPORTED_METADATA_TYPES)[number];

/**
 * Check whether a metadata type name is in the unsupported list
 * (requires browser automation instead of Metadata API deploy).
 */
export function isUnsupportedMetadataType(typeName: string): boolean {
  const typeNameLower = typeName.toLowerCase();
  return UNSUPPORTED_METADATA_TYPES.some(
    (t) => t.toLowerCase() === typeNameLower,
  );
}

/**
 * Prompt fragment that instructs the agent about unsupported metadata types.
 * Inject into the system prompt alongside SELF_DISCOVERY_PROMPT.
 */
export const UNSUPPORTED_METADATA_PROMPT = `
## Metadata Types Requiring Browser Automation

The following Salesforce configuration types have NO Metadata API support.
Do NOT attempt to deploy them via \`sf project deploy start\`.
Instead, use browser automation tools (browser_open, browser_click, browser_fill, browser_execute).

${UNSUPPORTED_METADATA_TYPES.map((t) => `- ${t}`).join("\n")}

When you encounter one of these types:
1. Use browser_open to navigate to the relevant Setup page
2. Use browser_screenshot to verify you're on the right page
3. Use browser_fill and browser_click to configure settings
4. For Lightning Shadow DOM elements, use browser_execute with shadowRoot.querySelector()
5. Use browser_screenshot again to verify the configuration was applied
`;

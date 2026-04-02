/**
 * Map of common Salesforce Setup page names to their Lightning Setup URLs.
 *
 * Usage: navigate to `{instanceUrl}${SETUP_PAGES['AccountTeams']}` to jump
 * directly to the Account Teams setup page.
 *
 * These paths are stable across Salesforce API versions and work in both
 * production orgs and scratch orgs.
 */
export const SETUP_PAGES: Record<string, string> = {
  // --- Account & Contact ---
  AccountTeams: "/lightning/setup/AccountTeams/home",
  AccountSettings: "/lightning/setup/AccountSettings/home",
  ContactRoles: "/lightning/setup/ContactRoles/home",
  PersonAccounts: "/lightning/setup/PersonAccountSettings/home",

  // --- Territory & Division ---
  TerritoryManagement: "/lightning/setup/Territory2/home",
  Divisions: "/lightning/setup/Divisions/home",

  // --- Currency ---
  CurrencyExchangeRates: "/lightning/setup/CurrencyTypes/home",
  MultiCurrency: "/lightning/setup/CompanyCurrency/home",

  // --- Administration ---
  DelegatedAdministration: "/lightning/setup/DelegatedAdministration/home",
  CompanyInformation: "/lightning/setup/CompanyProfileInfo/home",
  BusinessHours: "/lightning/setup/BusinessHours/home",
  FiscalYear: "/lightning/setup/ForecastFiscalYear/home",
  Holidays: "/lightning/setup/Holiday/home",

  // --- Users & Permissions ---
  Users: "/lightning/setup/ManageUsers/home",
  Profiles: "/lightning/setup/EnhancedProfiles/home",
  PermissionSets: "/lightning/setup/PermSets/home",
  PermissionSetGroups: "/lightning/setup/PermSetGroups/home",
  Roles: "/lightning/setup/Roles/home",
  PublicGroups: "/lightning/setup/PublicGroups/home",
  Queues: "/lightning/setup/Queues/home",
  LoginHistory: "/lightning/setup/OrgLoginHistory/home",

  // --- Security ---
  FieldAccessibility: "/lightning/setup/FieldAccessibility/home",
  SharingSettings: "/lightning/setup/SecuritySharing/home",
  Certificates: "/lightning/setup/CertificatesAndKeysManagement/home",
  SessionSettings: "/lightning/setup/SecuritySession/home",
  NamedCredentials: "/lightning/setup/NamedCredential/home",
  ConnectedApps: "/lightning/setup/ConnectedApplication/home",
  AuthProviders: "/lightning/setup/AuthProvidersPage/home",

  // --- Data ---
  DataExport: "/lightning/setup/DataManagementExport/home",
  StorageUsage: "/lightning/setup/CompanyResourceDisk/home",
  MassDeleteRecords: "/lightning/setup/DataManagementManualDelete/home",
  MassTransferRecords: "/lightning/setup/DataManagementManualTransfer/home",
  DuplicateRules: "/lightning/setup/DuplicateRules/home",
  MatchingRules: "/lightning/setup/MatchingRules/home",

  // --- Objects & Fields ---
  ObjectManager: "/lightning/setup/ObjectManager/home",
  CustomMetadataTypes: "/lightning/setup/CustomMetadata/home",
  CustomSettings: "/lightning/setup/CustomSettings/home",
  CustomLabels: "/lightning/setup/ExternalStrings/home",
  PicklistValueSets: "/lightning/setup/Picklists/home",

  // --- Automation ---
  Flows: "/lightning/setup/Flows/home",
  ProcessBuilder: "/lightning/setup/ProcessAutomation/home",
  WorkflowRules: "/lightning/setup/WorkflowRules/home",
  ApprovalProcesses: "/lightning/setup/ApprovalProcesses/home",
  FlowSettings: "/lightning/setup/ProcessAutomationSettings/home",

  // --- Platform Events & Messaging ---
  PlatformEvents: "/lightning/setup/EventObjects/home",
  CustomNotifications: "/lightning/setup/CustomNotifications/home",

  // --- Lightning ---
  LightningAppBuilder: "/lightning/setup/FlexiPageList/home",
  AppManager: "/lightning/setup/NavigationMenus/home",
  Tabs: "/lightning/setup/CustomTabs/home",
  GlobalActions: "/lightning/setup/GlobalActions/home",
  PublisherLayouts: "/lightning/setup/PublisherLayouts/home",
  PathSettings: "/lightning/setup/PathAssistantSetupHome/home",

  // --- Apex & Visualforce ---
  ApexClasses: "/lightning/setup/ApexClasses/home",
  ApexTriggers: "/lightning/setup/ApexTriggers/home",
  VisualforcePages: "/lightning/setup/ApexPages/home",
  VisualforceComponents: "/lightning/setup/ApexComponents/home",
  StaticResources: "/lightning/setup/StaticResources/home",
  LightningComponents: "/lightning/setup/LightningComponentBundles/home",

  // --- Email ---
  EmailDeliverability: "/lightning/setup/OrgEmailSettings/home",
  EmailTemplates: "/lightning/setup/CommunicationTemplatesEmail/home",
  OrganizationWideAddresses: "/lightning/setup/OrgEmailAddresses/home",

  // --- Experience Cloud ---
  DigitalExperiences: "/lightning/setup/SetupNetworks/home",

  // --- Agentforce / Einstein ---
  Agents: "/lightning/setup/CopilotStudioHome/home",
  EinsteinSettings: "/lightning/setup/EinsteinSearchSettings/home",

  // --- Deploy ---
  DeploymentSettings: "/lightning/setup/DeploymentSettings/home",
  OutboundChangesets: "/lightning/setup/DeployStatus/home",
  InboundChangesets: "/lightning/setup/DeployStatus/home",
};

/**
 * Look up a Setup page URL by name. Case-insensitive, partial match.
 * Returns the first match or undefined.
 */
export function findSetupPage(query: string): string | undefined {
  const lower = query.toLowerCase();
  // Exact match first
  for (const [key, value] of Object.entries(SETUP_PAGES)) {
    if (key.toLowerCase() === lower) return value;
  }
  // Partial match
  for (const [key, value] of Object.entries(SETUP_PAGES)) {
    if (key.toLowerCase().includes(lower)) return value;
  }
  return undefined;
}

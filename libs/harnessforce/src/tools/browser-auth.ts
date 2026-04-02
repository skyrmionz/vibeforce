import { Page } from "playwright";
import { execSync } from "node:child_process";

interface OrgDisplayResult {
  status: number;
  result: {
    instanceUrl: string;
    accessToken: string;
    username?: string;
    alias?: string;
  };
}

/**
 * Authenticate a Playwright browser page to a Salesforce org via front door link.
 *
 * This avoids the standard login page entirely — it uses the access token from
 * `sf org display` to construct a frontdoor.jsp URL that grants an authenticated
 * session in one navigation.
 *
 * @param page - The Playwright Page instance to authenticate
 * @param orgAlias - Optional Salesforce org alias or username. If omitted, uses the default org.
 */
export async function authenticateBrowser(
  page: Page,
  orgAlias?: string
): Promise<void> {
  // 1. Run sf org display to get the access token and instance URL
  const aliasFlag = orgAlias ? ` -o ${orgAlias}` : "";
  const cmd = `sf org display --json${aliasFlag}`;

  let output: string;
  try {
    output = execSync(cmd, {
      encoding: "utf-8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to run "sf org display". Is the Salesforce CLI installed and an org authenticated?\n${message}`
    );
  }

  // 2. Parse the JSON output
  let parsed: OrgDisplayResult;
  try {
    parsed = JSON.parse(output) as OrgDisplayResult;
  } catch {
    throw new Error(
      `Failed to parse sf org display output as JSON:\n${output.slice(0, 500)}`
    );
  }

  const { instanceUrl, accessToken } = parsed.result;
  if (!instanceUrl || !accessToken) {
    throw new Error(
      `sf org display did not return instanceUrl or accessToken. ` +
        `Is the org authorized? Output: ${JSON.stringify(parsed.result)}`
    );
  }

  // 3. Navigate to the front door URL
  const frontDoorUrl = `${instanceUrl}/secur/frontdoor.jsp?sid=${accessToken}`;
  await page.goto(frontDoorUrl, { waitUntil: "domcontentloaded" });

  // 4. Wait for the page to settle — should land on Lightning home or Setup
  //    We wait for the one-app container or the setup tree to appear.
  try {
    await page.waitForSelector(
      'one-app-nav-bar, div.setupcontent, [class*="slds-page-header"]',
      { timeout: 15_000 }
    );
  } catch {
    // Not fatal — some orgs redirect differently. Log a warning.
    const currentUrl = page.url();
    if (
      currentUrl.includes("/lightning/") ||
      currentUrl.includes("/setup/") ||
      currentUrl.includes("/home/")
    ) {
      // We're in Lightning, good enough
      return;
    }
    throw new Error(
      `Front door login did not land on a recognized Salesforce page. ` +
        `Current URL: ${currentUrl}`
    );
  }
}

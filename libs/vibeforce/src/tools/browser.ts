import { StructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { chromium, Browser, BrowserContext, Page } from "playwright";

// ---------------------------------------------------------------------------
// Singleton browser state
// ---------------------------------------------------------------------------

let browser: Browser | null = null;
let context: BrowserContext | null = null;
let page: Page | null = null;

const isHeadless = (): boolean => {
  return process.env.VIBEFORCE_BROWSER_VISIBLE !== "true";
};

async function ensureBrowser(): Promise<Page> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: isHeadless(),
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    page = await context.newPage();
  }
  if (!page || page.isClosed()) {
    if (!context || context.pages().length === 0) {
      context = await browser.newContext({
        viewport: { width: 1440, height: 900 },
      });
    }
    page = await context.newPage();
  }
  return page;
}

async function closeBrowser(): Promise<void> {
  if (browser) {
    await browser.close().catch(() => {});
    browser = null;
    context = null;
    page = null;
  }
}

// Clean up on process exit
function registerCleanup(): void {
  const cleanup = () => {
    if (browser) {
      browser.close().catch(() => {});
      browser = null;
      context = null;
      page = null;
    }
  };
  process.on("exit", cleanup);
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

registerCleanup();

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

class BrowserOpenTool extends StructuredTool {
  name = "browser_open";
  description =
    "Open a URL in a Chromium browser and navigate to it. " +
    "Use this to open Salesforce org pages or any web URL. " +
    "The browser persists across calls — subsequent tools operate on the same page.";
  schema = z.object({
    url: z.string().describe("URL to navigate to"),
  });

  async _call({ url }: z.infer<typeof this.schema>): Promise<string> {
    const p = await ensureBrowser();
    await p.goto(url, { waitUntil: "domcontentloaded" });
    const title = await p.title();
    return `Navigated to: ${title} (${p.url()})`;
  }
}

class BrowserClickTool extends StructuredTool {
  name = "browser_click";
  description =
    "Click an element on the page. Supports CSS selectors and text-based " +
    'selectors (e.g., "text=Save", "button.primary"). ' +
    "Waits up to 10 seconds for the element, then pauses 500ms after clicking.";
  schema = z.object({
    selector: z
      .string()
      .describe(
        'CSS selector or text selector (e.g., "text=Save" or "button.primary")'
      ),
  });

  async _call({ selector }: z.infer<typeof this.schema>): Promise<string> {
    const p = await ensureBrowser();
    await p.click(selector, { timeout: 10_000 });
    await p.waitForTimeout(500);
    return `Clicked: ${selector}`;
  }
}

class BrowserFillTool extends StructuredTool {
  name = "browser_fill";
  description =
    "Fill a text input field with a value. Clears the existing value first.";
  schema = z.object({
    selector: z.string().describe("CSS selector for the input field"),
    value: z.string().describe("Value to type into the field"),
  });

  async _call({
    selector,
    value,
  }: z.infer<typeof this.schema>): Promise<string> {
    const p = await ensureBrowser();
    await p.fill(selector, value);
    return `Filled "${selector}" with value`;
  }
}

class BrowserScreenshotTool extends StructuredTool {
  name = "browser_screenshot";
  description =
    "Take a screenshot of the current browser page. Returns a base64-encoded PNG. " +
    "Use this to see what is on screen before clicking or to verify results.";
  schema = z.object({
    fullPage: z
      .boolean()
      .optional()
      .default(false)
      .describe("Capture the full scrollable page (default: viewport only)"),
  });

  async _call({ fullPage }: z.infer<typeof this.schema>): Promise<string> {
    const p = await ensureBrowser();
    const buffer = await p.screenshot({ fullPage });
    const base64 = buffer.toString("base64");
    return `Screenshot captured (${buffer.length} bytes). Base64 PNG data:\ndata:image/png;base64,${base64}`;
  }
}

class BrowserExecuteTool extends StructuredTool {
  name = "browser_execute";
  description =
    "Execute arbitrary JavaScript in the browser page context. " +
    "Returns the JSON-serialized result. " +
    "This is the key tool for Shadow DOM piercing — use document.querySelector().shadowRoot to reach elements inside Web Components.";
  schema = z.object({
    script: z
      .string()
      .describe("JavaScript code to execute in the page context"),
  });

  async _call({ script }: z.infer<typeof this.schema>): Promise<string> {
    const p = await ensureBrowser();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await p.evaluate(script);
    return JSON.stringify(result, null, 2);
  }
}

class BrowserCloseTool extends StructuredTool {
  name = "browser_close";
  description =
    "Close the browser instance and free resources. " +
    "Call this when you are done with browser interactions.";
  schema = z.object({});

  async _call(): Promise<string> {
    await closeBrowser();
    return "Browser closed";
  }
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export const browserOpen = new BrowserOpenTool();
export const browserClick = new BrowserClickTool();
export const browserFill = new BrowserFillTool();
export const browserScreenshot = new BrowserScreenshotTool();
export const browserExecute = new BrowserExecuteTool();
export const browserClose = new BrowserCloseTool();

export const browserTools = [
  browserOpen,
  browserClick,
  browserFill,
  browserScreenshot,
  browserExecute,
  browserClose,
];

// Re-export helpers for use by browser-auth and tests
export { ensureBrowser, closeBrowser };

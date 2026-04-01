---
name: Robot Framework Fallback
description: Use when Playwright browser_click fails due to Shadow DOM or blocked elements
trigger: When browser_click fails with timeout or element not found
---

# Robot Framework Fallback

When a Playwright `browser_click` fails (element not found, Shadow DOM blocked, or timeout), follow this escalation ladder:

## Step 1: Shadow DOM Piercing via browser_execute

Before falling back to Robot Framework, try piercing the Shadow DOM with JavaScript:

```
browser_execute({
  script: `
    // Single-level shadow DOM
    return document.querySelector('lightning-button')
      .shadowRoot.querySelector('button').click();
  `
})
```

For deeply nested Shadow DOMs (common in Salesforce Lightning):

```
browser_execute({
  script: `
    // Multi-level shadow piercing
    const el = document.querySelector('one-app-nav-bar')
      .shadowRoot.querySelector('one-app-nav-bar-item-root')
      .shadowRoot.querySelector('a');
    el.click();
    return el.textContent;
  `
})
```

For finding elements by text inside Shadow DOM:

```
browser_execute({
  script: `
    function findInShadow(root, text) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        if (walker.currentNode.textContent.trim().includes(text)) {
          return walker.currentNode.parentElement;
        }
      }
      for (const el of root.querySelectorAll('*')) {
        if (el.shadowRoot) {
          const found = findInShadow(el.shadowRoot, text);
          if (found) return found;
        }
      }
      return null;
    }
    const el = findInShadow(document, 'Save');
    if (el) el.click();
    return !!el;
  `
})
```

## Step 2: Robot Framework .robot File

If JavaScript-based clicking also fails (e.g., the element requires actual mouse events, or the page blocks programmatic clicks), generate and run a Robot Framework test:

1. Write a `.robot` file to `.vibeforce/temp/`:

```robot
*** Settings ***
Library    SeleniumLibrary
Suite Setup    Open Browser    ${URL}    chrome
Suite Teardown    Close Browser

*** Variables ***
${URL}    https://your-org.lightning.force.com

*** Keywords ***
Click Setup Element
    [Arguments]    ${locator}
    Wait Until Element Is Visible    ${locator}    timeout=15s
    Scroll Element Into View    ${locator}
    Click Element    ${locator}

Navigate To Setup Page
    [Arguments]    ${page_path}
    Go To    ${URL}${page_path}
    Wait Until Page Contains Element    css:div.setupcontent    timeout=15s

*** Test Cases ***
Perform Setup Task
    Navigate To Setup Page    /lightning/setup/AccountTeams/home
    Click Setup Element    xpath://button[contains(text(), 'Enable')]
```

2. Execute it:

```bash
robot .vibeforce/temp/setup-task.robot
```

## Step 3: CumulusCI Keywords (if installed)

If `cci` is available, you can use CumulusCI's built-in Browser keywords:

```robot
*** Settings ***
Library    cumulusci.robotframework.CumulusCI
Library    cumulusci.robotframework.Salesforce

*** Keywords ***
Enable Feature In Setup
    Open Test Browser
    Go To Setup Page    AccountTeams
    Wait Until Page Contains    Account Teams
    Click Button    Enable
    Close Browser
```

Check if CumulusCI is available:

```bash
cci version 2>/dev/null && echo "CumulusCI available" || echo "CumulusCI not installed"
```

## Common Salesforce Shadow DOM Patterns

These are the most frequently encountered Shadow DOM structures in Lightning:

| Component | Shadow Path |
|-----------|------------|
| `lightning-button` | `.shadowRoot.querySelector('button')` |
| `lightning-input` | `.shadowRoot.querySelector('input')` |
| `lightning-combobox` | `.shadowRoot.querySelector('input[role="combobox"]')` |
| `lightning-textarea` | `.shadowRoot.querySelector('textarea')` |
| `lightning-checkbox` | `.shadowRoot.querySelector('input[type="checkbox"]')` |
| `lightning-tab` | `.shadowRoot.querySelector('a')` |
| `lightning-modal` | `.shadowRoot.querySelector('.slds-modal__container')` |

## Decision Flowchart

```
browser_click failed
    |
    v
Try browser_execute with shadowRoot piercing
    |
    +-- Success -> Done
    |
    +-- Fail -> Is Robot Framework installed?
                    |
                    +-- Yes -> Generate .robot file, run it
                    |
                    +-- No -> Is CumulusCI installed?
                                |
                                +-- Yes -> Use cci robot keywords
                                |
                                +-- No -> Install robotframework + seleniumlibrary:
                                          pip install robotframework robotframework-seleniumlibrary
```

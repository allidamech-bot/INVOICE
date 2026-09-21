const { chromium } = require('playwright');

// The CI/runtime image ships the full Chromium binary but may omit Playwright's
// separate headless-shell download. Keep the visual runners portable by using
// the browser Playwright has already resolved when no executable is specified.
const launch = chromium.launch.bind(chromium);
chromium.launch = options => launch({
  ...options,
  executablePath: options?.executablePath || process.env.LOUREX_QA_CHROMIUM || chromium.executablePath()
});

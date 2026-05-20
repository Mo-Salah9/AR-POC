/** Text detected in camera → URL to open */
export const TARGETS = [
  {
    text: "الرياضيات",
    url: "https://www.google.com",
    buttonLabel: "فتح Google",
  },
];

export const SCAN_INTERVAL_MS = 1200;
export const LINK_COOLDOWN_MS = 8000;
/** Require this many scans in a row before opening link (reduces false positives) */
export const MATCHES_REQUIRED = 2;

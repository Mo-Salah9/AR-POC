/** Text detected in camera → URL to open */
export const TARGETS = [
  {
    text: "الرياضيات",
    /** OCR often reads the book label without «ال» */
    aliases: ["رياضيات"],
    url: "https://www.google.com",
    buttonLabel: "فتح Google",
  },
];

export const SCAN_INTERVAL_MS = 600;
export const LINK_COOLDOWN_MS = 8000;
export const MATCHES_REQUIRED = 1;

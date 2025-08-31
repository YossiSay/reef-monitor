export const takeLast = (arr, n) => (Array.isArray(arr) ? arr.slice(-n) : []);
export const ndjsonLineToObj = (line) => { try { return JSON.parse(line); } catch { return null; } };
export const last = (arr, n = 1) => (Array.isArray(arr) ? arr.slice(-n) : []);
export const normalizeMacInput = (s) => {
  const hex = (s || "").toUpperCase().replace(/[^0-9A-F]/g, "");
  return hex.length === 12 ? hex.match(/.{1,2}/g).join(":") : (s || "").toUpperCase();
};
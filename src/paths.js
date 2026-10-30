export function normalizeBase(value = "/") {
  if (value.split("/").some(part => part === "." || part === "..") || !/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(value)) {
    throw Error("VITE_BASE_PATH must be an absolute path with a trailing slash");
  }
  return value;
}

export const BASE_URL = import.meta.env?.BASE_URL || "/";

export function assetURL(path = "", base = BASE_URL) {
  return normalizeBase(base) + String(path).replace(/^\/+/, "");
}

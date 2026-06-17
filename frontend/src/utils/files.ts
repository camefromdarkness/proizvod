const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8080";

export function fileURL(path?: string): string {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://") || path.startsWith("blob:")) {
    return path;
  }
  return `${API_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

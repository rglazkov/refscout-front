const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** Adds the deployment prefix to a file served from public/. */
export function publicPath(path: `/${string}`): string {
  return `${basePath}${path}`;
}

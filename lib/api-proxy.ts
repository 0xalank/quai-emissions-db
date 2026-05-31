import { NextResponse } from "next/server";

const UPSTREAM_API_BASE_URL = process.env.UPSTREAM_API_BASE_URL;

export async function proxyToUpstreamApi(req: Request): Promise<NextResponse | null> {
  if (!UPSTREAM_API_BASE_URL) return null;

  const incoming = new URL(req.url);
  const upstream = new URL(UPSTREAM_API_BASE_URL);
  upstream.pathname = incoming.pathname;
  upstream.search = incoming.search;

  const res = await fetch(upstream, {
    headers: {
      accept: req.headers.get("accept") ?? "application/json",
    },
    cache: "no-store",
  });
  const body = await res.text();
  const headers = new Headers();
  const contentType = res.headers.get("content-type");
  const cacheControl = res.headers.get("cache-control");
  if (contentType) headers.set("content-type", contentType);
  if (cacheControl) headers.set("cache-control", cacheControl);

  return new NextResponse(body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

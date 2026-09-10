import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Toaster } from "sonner";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { makeQueryClient } from "@/lib/query";
import appCss from "../styles.css?url";

import { APP_NAME } from "@/lib/platform";
import { clearStaleReloadFlag, maybeAutoReloadStale } from "@/lib/chunk-reload";

const fetchSessionUser = createServerFn({ method: "GET" }).handler(async () => {
  try {
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const u = await Promise.race([
      getSessionUser(),
      new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 8_000);
      }),
    ]);
    return u ? { id: u.id, email: u.email } : null;
  } catch {
    return null;
  }
});

export const Route = createRootRoute({
  beforeLoad: async () => ({ sessionUser: await fetchSessionUser() }),
  headers: () => ({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "X-DNS-Prefetch-Control": "off",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
    "X-Frame-Options": "SAMEORIGIN",
    "Cache-Control": "no-store, no-cache, must-revalidate",
  }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: APP_NAME },
      { name: "theme-color", content: "#0f172a" },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap",
      },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  const [client] = useState(() => makeQueryClient());
  useEffect(() => {
    clearStaleReloadFlag();
    const onPreloadError = (event: Event) => {
      event.preventDefault();
      maybeAutoReloadStale();
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    return () => window.removeEventListener("vite:preloadError", onPreloadError);
  }, []);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <QueryClientProvider client={client}>
            <Outlet />
            <Toaster position="top-right" richColors closeButton />
          </QueryClientProvider>
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}

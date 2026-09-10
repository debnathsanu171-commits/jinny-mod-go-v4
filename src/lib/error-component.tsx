import type { ErrorComponentProps } from "@tanstack/react-router";
import { TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { hardOpenApp, maybeAutoReloadStale } from "@/lib/chunk-reload";

function isStaleChunk(message: string) {
  return /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i.test(
    message,
  );
}

function errorText(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  return "An unexpected error occurred. Try reloading the page.";
}

export function AppErrorComponent({ error }: ErrorComponentProps) {
  const message = errorText(error);
  const stale = isStaleChunk(message);

  useEffect(() => {
    if (!stale || typeof window === "undefined") return;
    maybeAutoReloadStale();
  }, [stale]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background px-6 text-center text-on-surface">
      <span className="text-danger" aria-hidden="true">
        <TriangleAlert className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">Something went wrong</h1>
      <p className="max-w-md text-sm break-words text-muted">
        {stale
          ? "A new version of JINNY MOD GO is live. Tap Reload — the app will open Projects with a fresh copy."
          : message}
      </p>
      <button
        type="button"
        className="mt-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-on-primary"
        onClick={() => hardOpenApp("/projects")}
      >
        Reload
      </button>
    </main>
  );
}

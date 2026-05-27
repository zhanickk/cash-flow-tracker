import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Dimak" },
      {
        name: "description",
        content:
          "Web app for currency exchange offices to track daily cash flow across 6 currencies.",
      },
      { name: "author", content: "Dimak" },
      { property: "og:title", content: "Dimak" },
      {
        property: "og:description",
        content:
          "Web app for currency exchange offices to track daily cash flow across 6 currencies.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@Dimak" },
      { name: "twitter:title", content: "Dimak" },
      {
        name: "twitter:description",
        content:
          "Web app for currency exchange offices to track daily cash flow across 6 currencies.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1b40b843-7e5f-4163-b417-5dcfc455baad/id-preview-3e3dda2b--5d75bc87-50e2-46bb-a1ef-298369ab6e9f.lovable.app-1779900187524.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/1b40b843-7e5f-4163-b417-5dcfc455baad/id-preview-3e3dda2b--5d75bc87-50e2-46bb-a1ef-298369ab6e9f.lovable.app-1779900187524.png",
      },
      { name: "description", content: "Web app for currency exchange offices to track daily cash flow across 6 currencies." },
      { property: "og:description", content: "Web app for currency exchange offices to track daily cash flow across 6 currencies." },
      { name: "twitter:description", content: "Web app for currency exchange offices to track daily cash flow across 6 currencies." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5f75f2e6-9882-43ce-8f2c-5467eb1356d1/id-preview-65ea28c9--5d75bc87-50e2-46bb-a1ef-298369ab6e9f.lovable.app-1779918931427.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/5f75f2e6-9882-43ce-8f2c-5467eb1356d1/id-preview-65ea28c9--5d75bc87-50e2-46bb-a1ef-298369ab6e9f.lovable.app-1779918931427.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function HideLovableBadge() {
  useEffect(() => {
    const hide = () => {
      document.querySelectorAll("a, button, [role='button']").forEach((el) => {
        const text = el.textContent?.trim() ?? "";
        if (/edit\s+(with|in)\s+lovable/i.test(text)) {
          const node = el as HTMLElement;
          node.style.display = "none";
          node.style.pointerEvents = "none";
          const parent = node.parentElement;
          if (parent && parent.childElementCount === 1) {
            parent.style.display = "none";
          }
        }
      });
      document.querySelectorAll('a[href*="lovable.dev"]').forEach((el) => {
        const node = el as HTMLElement;
        if (/edit/i.test(node.textContent ?? "")) {
          node.style.display = "none";
        }
      });
    };
    hide();
    const observer = new MutationObserver(hide);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return null;
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <HideLovableBadge />
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}

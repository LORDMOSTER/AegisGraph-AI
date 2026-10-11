import os

app_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\App.tsx"

with open(app_path, "r", encoding="utf-8") as f:
    code = f.read()

# Add NotFound and analytics imports
if 'import { NotFound }' not in code:
    code = code.replace(
        'import { updateMetaTags } from "./hooks/useMetaTags";',
        'import { updateMetaTags } from "./hooks/useMetaTags";\nimport { NotFound } from "./pages/NotFound";\nimport { analytics } from "./utils/analytics";'
    )

# Update AppRoute type
code = code.replace(
    'export type AppRoute = "login" | "register" | "app" | "verify" | "privacy" | "terms";',
    'export type AppRoute = "login" | "register" | "app" | "verify" | "privacy" | "terms" | "not-found";'
)

# Update initial route detection
old_init_route = '''    if (path.startsWith("/verify/")) return "verify";
    if (path === "/privacy" || hash === "#privacy") return "privacy";
    if (path === "/terms" || hash === "#terms") return "terms";
    if (path === "/register" || hash === "#register") return "register";
    return "login";'''

new_init_route = '''    if (path.startsWith("/verify/")) return "verify";
    if (path === "/privacy" || hash === "#privacy") return "privacy";
    if (path === "/terms" || hash === "#terms") return "terms";
    if (path === "/register" || hash === "#register") return "register";
    if (path === "/" || path === "/login" || path === "") return "login";
    return "not-found";'''

code = code.replace(old_init_route, new_init_route)

# Update popstate handler
old_popstate = '''      } else if (path === "/" || !hash) {
        setCurrentRoute("login");
      }'''

new_popstate = '''      } else if (path === "/" || path === "/login" || (!hash && path === "")) {
        setCurrentRoute("login");
      } else {
        setCurrentRoute("not-found");
      }'''

code = code.replace(old_popstate, new_popstate)

# Add analytics tracking hook
target_analytics_effect = '''  // Track route pageview in analytics
  useEffect(() => {
    analytics.trackPageView(`AegisGraph AI - ${currentRoute}`, window.location.pathname);
  }, [currentRoute]);'''

if "analytics.trackPageView" not in code:
    code = code.replace(
        '  // URL PopState / HashChange listener',
        target_analytics_effect + '\n\n  // URL PopState / HashChange listener'
    )

# Add not-found render block before login
not_found_render = '''  if (currentRoute === "not-found") {
    return (
      <>
        <NotFound
          onNavigate={(r) => navigateTo(r as AppRoute)}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
        />
        <CookieConsent onNavigatePolicy={openPolicy} />
      </>
    );
  }

  if (currentRoute === "login" || currentRoute === "register") {'''

code = code.replace('  if (currentRoute === "login" || currentRoute === "register") {', not_found_render)

with open(app_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(code)

print("App.tsx updated with 404 routing and analytics integration")

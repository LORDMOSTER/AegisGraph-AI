app_path = r"c:\Users\hsri5\OneDrive\Desktop\AegisGraph-AI-main\frontend\src\App.tsx"

with open(app_path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace React imports
content = content.replace(
    'import { useCallback, useEffect, useState } from "react";',
    'import { useCallback, useEffect, useState, lazy, Suspense } from "react";'
)

# Replace static imports with lazy
target_imports = '''import { PrivacyPolicy } from "./pages/PrivacyPolicy";
import { TermsAndConditions } from "./pages/TermsAndConditions";'''

replacement_imports = '''const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy").then((m) => ({ default: m.PrivacyPolicy })));
const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions").then((m) => ({ default: m.TermsAndConditions })));'''

if target_imports in content:
    content = content.replace(target_imports, replacement_imports, 1)
else:
    # Try line by line or handle CRLF
    content = content.replace('import { PrivacyPolicy } from "./pages/PrivacyPolicy";', 'const PrivacyPolicy = lazy(() => import("./pages/PrivacyPolicy").then((m) => ({ default: m.PrivacyPolicy })));')
    content = content.replace('import { TermsAndConditions } from "./pages/TermsAndConditions";', 'const TermsAndConditions = lazy(() => import("./pages/TermsAndConditions").then((m) => ({ default: m.TermsAndConditions })));')

# Wrap rendering with Suspense
target_privacy_render = '''  if (currentRoute === "privacy") {
    return (
      <>
        <PrivacyPolicy
          onBack={() => navigateTo(returnRoute)}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
        />
        <CookieConsent onNavigatePolicy={openPolicy} />
      </>
    );
  }'''

replacement_privacy_render = '''  if (currentRoute === "privacy") {
    return (
      <Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--muted)" }}>Loading Privacy Policy...</div>}>
        <PrivacyPolicy
          onBack={() => navigateTo(returnRoute)}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
        />
        <CookieConsent onNavigatePolicy={openPolicy} />
      </Suspense>
    );
  }'''

target_terms_render = '''  if (currentRoute === "terms") {
    return (
      <>
        <TermsAndConditions
          onBack={() => navigateTo(returnRoute)}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
        />
        <CookieConsent onNavigatePolicy={openPolicy} />
      </>
    );
  }'''

replacement_terms_render = '''  if (currentRoute === "terms") {
    return (
      <Suspense fallback={<div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "var(--muted)" }}>Loading Terms & Conditions...</div>}>
        <TermsAndConditions
          onBack={() => navigateTo(returnRoute)}
          darkMode={darkMode}
          onToggleDark={() => setDarkMode((d) => !d)}
        />
        <CookieConsent onNavigatePolicy={openPolicy} />
      </Suspense>
    );
  }'''

# Replace normalize newlines for matching
content = content.replace("\r\n", "\n")
target_privacy_render = target_privacy_render.replace("\r\n", "\n")
replacement_privacy_render = replacement_privacy_render.replace("\r\n", "\n")
target_terms_render = target_terms_render.replace("\r\n", "\n")
replacement_terms_render = replacement_terms_render.replace("\r\n", "\n")

content = content.replace(target_privacy_render, replacement_privacy_render)
content = content.replace(target_terms_render, replacement_terms_render)

with open(app_path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)

print("App.tsx updated with Suspense and lazy loading")

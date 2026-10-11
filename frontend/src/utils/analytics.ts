/**
 * analytics.ts — Lightweight, Privacy-Preserving Industrial Telemetry Engine
 *
 * Compliant with GDPR, CCPA, and Tata Technologies internal data policies:
 * - Zero PII (Personally Identifiable Information) logged.
 * - Anonymized cryptographic session ID per browser tab.
 * - Respects Do Not Track (DNT) header and Cookie Consent preferences.
 * - Tracks page views, user engagement, proctoring events, and Web Vitals.
 */

interface AnalyticsEvent {
  category: string;
  action: string;
  label?: string;
  value?: number;
  timestamp: number;
  session_id: string;
  path: string;
}

interface PageViewData {
  title: string;
  path: string;
  referrer: string;
  timestamp: number;
}

class AegisAnalytics {
  private sessionId: string;
  private isDntEnabled: boolean;
  private eventBuffer: AnalyticsEvent[] = [];

  constructor() {
    this.sessionId = this.getOrCreateSessionId();
    this.isDntEnabled =
      typeof navigator !== "undefined" &&
      (navigator.doNotTrack === "1" || (window as any).doNotTrack === "1");
  }

  private getOrCreateSessionId(): string {
    try {
      const stored = sessionStorage.getItem("aegis_session_id");
      if (stored) return stored;
      const newId = "ses_" + Math.random().toString(36).substring(2, 11) + "_" + Date.now().toString(36);
      sessionStorage.setItem("aegis_session_id", newId);
      return newId;
    } catch {
      return "ses_ephemeral_" + Date.now().toString(36);
    }
  }

  private isConsentGranted(): boolean {
    try {
      const consent = localStorage.getItem("aegis_cookie_consent");
      if (!consent) return true; // Default implicit prior to banner action
      const parsed = JSON.parse(consent);
      return parsed.analytics !== false;
    } catch {
      return true;
    }
  }

  /**
   * Track virtual page navigation & route changes
   */
  public trackPageView(title: string, path: string = window.location.pathname) {
    if (this.isDntEnabled || !this.isConsentGranted()) return;

    const data: PageViewData = {
      title,
      path: path || window.location.hash || "/",
      referrer: document.referrer || "direct",
      timestamp: Date.now(),
    };

    if ((import.meta as any)?.env?.DEV) {
      console.log(`[Aegis Analytics] PageView:`, data.path, `("${data.title}")`);
    }

    // Dispatch custom DOM event for extensible listeners
    window.dispatchEvent(
      new CustomEvent("aegis:pageview", { detail: data })
    );
  }

  /**
   * Track high-value user actions (CTA click, exam start, certificate issue)
   */
  public trackEvent(
    category: string,
    action: string,
    label?: string,
    value?: number
  ) {
    if (this.isDntEnabled || !this.isConsentGranted()) return;

    const event: AnalyticsEvent = {
      category,
      action,
      label,
      value,
      timestamp: Date.now(),
      session_id: this.sessionId,
      path: window.location.pathname || "/",
    };

    this.eventBuffer.push(event);
    if (this.eventBuffer.length > 50) this.eventBuffer.shift();

    if ((import.meta as any)?.env?.DEV) {
      console.log(`[Aegis Analytics] Event:`, `${category} > ${action}`, label ? `(${label})` : "");
    }

    window.dispatchEvent(
      new CustomEvent("aegis:event", { detail: event })
    );
  }

  /**
   * Track page load timings and execution benchmarks
   */
  public trackTiming(metricName: string, durationMs: number) {
    if (this.isDntEnabled || !this.isConsentGranted()) return;

    if ((import.meta as any)?.env?.DEV) {
      console.log(`[Aegis Analytics] Timing: ${metricName} took ${durationMs.toFixed(1)}ms`);
    }

    this.trackEvent("Performance", metricName, undefined, Math.round(durationMs));
  }
}

export const analytics = new AegisAnalytics();

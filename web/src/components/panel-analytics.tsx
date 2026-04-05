import { Analytics } from "@vercel/analytics/next";

/** Vercel Web Analytics for staff-only routes (mounted from segment layouts). */
export function PanelAnalytics() {
  return <Analytics />;
}

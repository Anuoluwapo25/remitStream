import { InsightsPanel } from "@/components/InsightsPanel";

export default function InsightsPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Insights</h1>
        <p className="mt-1 text-sm text-slate-400">
          Live product analytics, error monitoring, and user feedback for the
          RemitStream pilot.
        </p>
      </div>
      <InsightsPanel />
    </div>
  );
}

import { DashboardPanel } from "@/components/DashboardPanel";

export default function DashboardPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recipient dashboard</h1>
        <p className="mt-1 text-sm text-stone-400">
          Set savings goals, watch each one fill with every transfer, and
          withdraw anytime.
        </p>
      </div>
      <DashboardPanel />
    </div>
  );
}

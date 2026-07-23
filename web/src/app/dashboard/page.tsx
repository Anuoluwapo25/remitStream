import { DashboardPanel } from "@/components/DashboardPanel";

export default function DashboardPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Recipient dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">
          Manage your auto-save rule, watch your vault earn yield, and withdraw
          anytime.
        </p>
      </div>
      <DashboardPanel />
    </div>
  );
}

import { HistoryPanel } from "@/components/HistoryPanel";

export const metadata = {
  title: "Transaction history — RemitStream",
};

export default function HistoryPage() {
  return (
    <div className="animate-fade-in space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Transaction history
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Every transfer, withdrawal and rule change on your wallet — read
          straight from the Stellar ledger, each one linked to the block
          explorer.
        </p>
      </div>
      <HistoryPanel />
    </div>
  );
}

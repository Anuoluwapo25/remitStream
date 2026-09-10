import Link from "next/link";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/history", label: "History" },
  { href: "/insights", label: "Insights" },
];

export function Footer() {
  return (
    <footer className="mt-24 border-t border-white/10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-stone-500">
          RemitStream · Stellar testnet — balances are test funds and hold no
          real value.
        </p>
        <nav className="flex flex-wrap gap-5">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="text-stone-400 transition hover:text-white"
            >
              {l.label}
            </Link>
          ))}
          <a
            href="https://github.com/RemitStream/remitStream"
            target="_blank"
            rel="noreferrer"
            className="text-stone-400 transition hover:text-white"
          >
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}

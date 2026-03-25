import { LoanFlowCard } from "@/components/loan-flow-card";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">SplitLend</p>
        <h1>Private position splitting for collateralized lending.</h1>
        <p className="hero-copy">
          Split one owner wallet into multiple ephemeral borrower wallets,
          deposit collateral, and manage borrow or repay flows while keeping
          the owner-to-borrower link offchain.
        </p>
      </section>
      <LoanFlowCard />
    </main>
  );
}

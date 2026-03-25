import { LoanFlowCard } from "@/components/loan-flow-card";

export default function HomePage() {
  return (
    <main className="page-shell">
      <section className="hero">
        <p className="eyebrow">Privacy Lending MVP</p>
        <h1>Split A into multiple ephemeral B wallets while keeping the link offchain.</h1>
        <p className="hero-copy">
          The frontend now handles wallet connection, quote requests, deposit
          approval, local B1..Bn generation, and a single owner-signed batch
          split plan for backend handoff.
        </p>
      </section>
      <LoanFlowCard />
    </main>
  );
}

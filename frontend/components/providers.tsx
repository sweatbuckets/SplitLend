"use client";

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { WagmiProvider, createConfig, injected } from "wagmi";
import { http } from "viem";
import { defineChain } from "viem";

const queryClient = new QueryClient();

const anvilChain = defineChain({
  id: 31337,
  name: "Anvil",
  nativeCurrency: {
    decimals: 18,
    name: "Ether",
    symbol: "ETH"
  },
  rpcUrls: {
    default: {
      http: [process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545"]
    }
  }
});

const wagmiConfig = createConfig({
  chains: [anvilChain],
  connectors: [injected()],
  transports: {
    [anvilChain.id]: http(process.env.NEXT_PUBLIC_RPC_URL ?? "http://127.0.0.1:8545")
  },
  ssr: true
});

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={darkTheme({
            accentColor: "#b5542f",
            accentColorForeground: "#fffaf4",
            borderRadius: "large",
            fontStack: "system"
          })}
        >
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

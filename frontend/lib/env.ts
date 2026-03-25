function requiredEnv(value: string | undefined, name: string, fallback?: string) {
  const resolved = value ?? fallback;

  if (!resolved) {
    throw new Error(`Missing required env var: ${name}`);
  }

  return resolved;
}

export const walletConnectProjectId = requiredEnv(
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
  "demo-project-id"
);

export const backendUrl = requiredEnv(
  process.env.NEXT_PUBLIC_BACKEND_URL,
  "NEXT_PUBLIC_BACKEND_URL"
);
export const chainId = Number(
  requiredEnv(process.env.NEXT_PUBLIC_CHAIN_ID, "NEXT_PUBLIC_CHAIN_ID", "31337")
);

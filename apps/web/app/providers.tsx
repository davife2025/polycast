"use client";

import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { wagmiConfig } from "@/lib/chain";

export function Providers({ children }: { children: React.ReactNode }) {
  // Created inside the component (not at module scope) so each request
  // gets its own QueryClient under Next.js's server rendering — a shared
  // module-level client would leak cached data across different users.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </WagmiProvider>
  );
}

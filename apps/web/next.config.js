/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@polycast/ui", "@polycast/abi"],
  webpack: (config) => {
    // wagmi/connectors' barrel export includes a Coinbase Smart Wallet
    // connector, which pulls in @coinbase/cdp-sdk's optional x402 payment
    // support. We only use the plain `injected` connector, so these are
    // never actually reached at runtime — but webpack still needs to
    // resolve the import graph, so alias them to an empty module.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@x402/core/client": false,
      "@x402/evm": false,
      "@x402/evm/exact/client": false,
      "@x402/svm/exact/client": false,
    };
    return config;
  },
};

module.exports = nextConfig;

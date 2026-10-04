/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Concept previews for outreach: never indexed, never leak the private URL as a referrer.
  async headers() {
    return [
      {
        source: "/preview/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};
export default nextConfig;

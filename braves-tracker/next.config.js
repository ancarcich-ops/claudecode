/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // MLB headshots / team logos are served from these hosts.
    remotePatterns: [
      { protocol: 'https', hostname: 'img.mlbstatic.com' },
      { protocol: 'https', hostname: 'midfield.mlbstatic.com' },
    ],
  },
};

module.exports = nextConfig;

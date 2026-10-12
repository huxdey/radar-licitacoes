/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: { bodySizeLimit: '50mb' },
    serverComponentsExternalPackages: ['mammoth', 'xlsx', 'jszip'],
  },
};
export default nextConfig;

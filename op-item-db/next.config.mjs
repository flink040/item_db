/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    dirs: ['app', 'components', 'lib', 'scripts']
  },
  experimental: {},
  images: {
    formats: ['image/avif', 'image/webp']
  },
  output: 'standalone',
  serverExternalPackages: ['@supabase/supabase-js', '@supabase/ssr'],
  typescript: {
    ignoreBuildErrors: false
  }
};

export default nextConfig;

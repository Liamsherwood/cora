import type { NextConfig } from "next"

import { defaultLocale } from "./lib/i18n/locales"

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/", destination: `/${defaultLocale}`, permanent: true }]
  },
}

export default nextConfig

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'VNSVault – Kho Game Visual Novel',
    short_name: 'VNSVault',
    description: 'Kho tàng Visual Novel được Việt hóa. Miễn phí, không quảng cáo.',
    start_url: '/',
    display: 'standalone',
    background_color: '#09090f',
    theme_color: '#b87333',
    orientation: 'portrait-primary',
    categories: ['games', 'entertainment'],
    lang: 'vi',
    icons: [
      { src: '/logo.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/logo.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
    screenshots: [
      { src: '/og-default.png', sizes: '1200x630', type: 'image/png', form_factor: 'wide' },
    ],
  };
}

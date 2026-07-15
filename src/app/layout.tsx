import type { Metadata, Viewport } from 'next';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import Script from 'next/script';
import Navbar from '@/components/layout/Navbar';
import Footer from '@/components/layout/Footer';
import VipAnnouncementBar from '@/components/layout/VipAnnouncementBar';
import AnnouncementModal from '@/components/layout/AnnouncementModal';
import { ToastProvider } from '@/components/ui/Toast';
import { safeJsonLd } from '@/lib/utils';
import './globals.css';

const APP_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://vnsvault.vercel.app';
const APP_NAME = 'VNSVault';
const APP_DESC = 'Kho tàng Visual Novel chất lượng cao được Việt hóa. Miễn phí, không quảng cáo, cập nhật liên tục.';
const GA_ID = process.env.NEXT_PUBLIC_GA_ID;

export const viewport: Viewport = {
  themeColor: '#b87333',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: `${APP_NAME} – Kho Game Visual Novel Việt Hóa`,
    template: `%s | ${APP_NAME}`,
  },
  description: APP_DESC,
  keywords: [
    'visual novel', 'game lọ', 'việt hóa', 'renpy', 'VNSVault',
    'game tiếng việt', 'novel game',
    'download visual novel', 'vn việt', 'game 18+',
  ],
  authors: [{ name: 'VNSVault Team', url: APP_URL }],
  creator: 'VNSVault',
  publisher: 'VNSVault',
  applicationName: APP_NAME,
  referrer: 'origin-when-cross-origin',
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    type: 'website',
    locale: 'vi_VN',
    url: APP_URL,
    siteName: APP_NAME,
    title: `${APP_NAME} – Kho Game Visual Novel Việt Hóa`,
    description: APP_DESC,
    images: [
      {
        url: '/og-default.png',
        width: 1200,
        height: 630,
        alt: `${APP_NAME} – Visual Novel Hub`,
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} – Kho Game Visual Novel Việt Hóa`,
    description: APP_DESC,
    images: ['/og-default.png'],
    creator: '@vnsvault',
  },
  alternates: {
    canonical: APP_URL,
    languages: { 'vi-VN': APP_URL },
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { url: '/icon-512.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }],
  },
  manifest: '/manifest.webmanifest',
  category: 'games',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="vi"
      className={`h-full `}
    >
      <head>
        {/* Google Analytics — next/script handles correct loading/ordering,
            fixing the @next/next/next-script-for-ga lint warning. Only
            rendered when NEXT_PUBLIC_GA_ID is set, so dev/staging/preview
            deploys don't pollute the production analytics dashboard. */}
        {GA_ID && (
          <>
            <Script
              src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
              strategy="afterInteractive"
            />
            <Script id="ga-init" strategy="afterInteractive">
              {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_ID}');`}
            </Script>
          </>
        )}
        {/* JSON-LD: Organization */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd({
              '@context': 'https://schema.org',
              '@type': 'Organization',
              name: APP_NAME,
              url: APP_URL,
              logo: `${APP_URL}/logo.png`,
              description: APP_DESC,
              sameAs: [],
            }),
          }}
        />
        {/* JSON-LD: WebSite with Sitelinks Searchbox */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: safeJsonLd({
              '@context': 'https://schema.org',
              '@type': 'WebSite',
              name: APP_NAME,
              url: APP_URL,
              description: APP_DESC,
              inLanguage: 'vi-VN',
              potentialAction: {
                '@type': 'SearchAction',
                target: { '@type': 'EntryPoint', urlTemplate: `${APP_URL}/games?q={search_term_string}` },
                'query-input': 'required name=search_term_string',
              },
            }),
          }}
        />
      </head>
      <body className="min-h-full flex flex-col antialiased">
        {/* Rendered ONCE here instead of per-page: previously every page (and
            every loading/error/not-found boundary) mounted its own <Navbar />,
            so each navigation remounted it from scratch — resetting its user
            state to null and re-fetching /api/auth/me, which showed up as a
            brief "logged out" flash even though the session cookie was still
            valid. Living in the root layout, Navbar now persists across
            client-side navigations like any other shared layout chrome. */}
        <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] btn-copper text-sm">
          Bỏ qua điều hướng
        </a>
        <Navbar />
        <VipAnnouncementBar />
        <AnnouncementModal />
        <ToastProvider>
          {/* pt reserves exactly the banner's live height (0px when hidden/dismissed),
              published as --vip-banner-h by VipAnnouncementBar, so its fixed strip
              never overlaps the top of any page's content. */}
          <div className="flex-1 flex flex-col pt-[var(--vip-banner-h)]">{children}</div>
        </ToastProvider>
        <Footer />
        <Analytics />
        <SpeedInsights /></body>
    </html>
  );
}

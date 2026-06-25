import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const SITE_NAME = 'Elite Online Healthcare';
const DEFAULT_DESCRIPTION =
  'Elite Online Healthcare is a telemedicine platform for booking online consultations, secure payments, video visits, and digital prescriptions.';

const PUBLIC_ROUTE_META = {
  '/': {
    title: 'Elite Online Healthcare | Online Doctor Consultations',
    description: DEFAULT_DESCRIPTION,
    robots: 'index,follow'
  },
  '/login': {
    title: 'Login | Elite Online Healthcare',
    description: 'Log in to your Elite Online Healthcare account to manage appointments, consultations, and prescriptions.',
    robots: 'noindex,follow'
  },
  '/register': {
    title: 'Create Account | Elite Online Healthcare',
    description: 'Create an Elite Online Healthcare account to book online healthcare consultations.',
    robots: 'index,follow'
  },
  '/forgot-password': {
    title: 'Forgot Password | Elite Online Healthcare',
    description: 'Recover access to your Elite Online Healthcare account.',
    robots: 'noindex,follow'
  },
  '/reset-password': {
    title: 'Reset Password | Elite Online Healthcare',
    description: 'Reset your Elite Online Healthcare account password.',
    robots: 'noindex,follow'
  }
};

const getMetaForPath = (pathname) => {
  if (PUBLIC_ROUTE_META[pathname]) return PUBLIC_ROUTE_META[pathname];

  return {
    title: `${SITE_NAME} | Patient Portal`,
    description: DEFAULT_DESCRIPTION,
    robots: 'noindex,nofollow'
  };
};

const upsertMeta = (selector, createAttributes, content) => {
  let element = document.head.querySelector(selector);
  if (!element) {
    element = document.createElement('meta');
    Object.entries(createAttributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    document.head.appendChild(element);
  }
  element.setAttribute('content', content);
};

const upsertCanonical = (href) => {
  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.setAttribute('rel', 'canonical');
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', href);
};

function SeoMeta() {
  const location = useLocation();

  useEffect(() => {
    const meta = getMetaForPath(location.pathname);
    const canonicalUrl = `${window.location.origin}${location.pathname}`;
    const imageUrl = `${window.location.origin}/images/elite.jpeg`;

    document.title = meta.title;
    upsertCanonical(canonicalUrl);
    upsertMeta('meta[name="description"]', { name: 'description' }, meta.description);
    upsertMeta('meta[name="robots"]', { name: 'robots' }, meta.robots);
    upsertMeta('meta[property="og:title"]', { property: 'og:title' }, meta.title);
    upsertMeta('meta[property="og:description"]', { property: 'og:description' }, meta.description);
    upsertMeta('meta[property="og:url"]', { property: 'og:url' }, canonicalUrl);
    upsertMeta('meta[property="og:image"]', { property: 'og:image' }, imageUrl);
    upsertMeta('meta[name="twitter:title"]', { name: 'twitter:title' }, meta.title);
    upsertMeta('meta[name="twitter:description"]', { name: 'twitter:description' }, meta.description);
    upsertMeta('meta[name="twitter:image"]', { name: 'twitter:image' }, imageUrl);
  }, [location.pathname]);

  return null;
}

export default SeoMeta;

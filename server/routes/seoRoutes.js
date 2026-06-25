const express = require('express');

const router = express.Router();

const PUBLIC_ROUTES = [
  { path: '/', changefreq: 'weekly', priority: '1.0' },
  { path: '/about', changefreq: 'monthly', priority: '0.7' },
  { path: '/register', changefreq: 'monthly', priority: '0.8' },
  { path: '/login', changefreq: 'monthly', priority: '0.4' },
  { path: '/forgot-password', changefreq: 'yearly', priority: '0.2' }
];

const xmlEscape = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const getBaseUrl = (req) => {
  const configuredUrl = process.env.SITE_URL || process.env.PUBLIC_SITE_URL || process.env.REACT_APP_SITE_URL;
  if (configuredUrl) return configuredUrl.replace(/\/+$/, '');

  const host = req.get('x-forwarded-host') || req.get('host');
  const protocol = req.get('x-forwarded-proto') || req.protocol || 'https';
  return `${protocol}://${host}`.replace(/\/+$/, '');
};

router.get(['/robots', '/robots.txt'], (req, res) => {
  const baseUrl = getBaseUrl(req);

  res.type('text/plain').send([
    'User-agent: *',
    'Allow: /',
    'Disallow: /api/',
    'Disallow: /admin',
    'Disallow: /admin/',
    'Disallow: /dashboard',
    'Disallow: /appointments',
    'Disallow: /book-appointment',
    'Disallow: /chat',
    'Disallow: /profile',
    'Disallow: /prescriptions',
    'Disallow: /payment/',
    'Disallow: /consultation/',
    '',
    `Sitemap: ${baseUrl}/sitemap.xml`,
    ''
  ].join('\n'));
});

router.get(['/sitemap', '/sitemap.xml'], (req, res) => {
  const baseUrl = getBaseUrl(req);
  const lastmod = new Date().toISOString().slice(0, 10);
  const urls = PUBLIC_ROUTES.map((route) => [
    '  <url>',
    `    <loc>${xmlEscape(`${baseUrl}${route.path}`)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${route.changefreq}</changefreq>`,
    `    <priority>${route.priority}</priority>`,
    '  </url>'
  ].join('\n')).join('\n');

  res.type('application/xml').send([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    urls,
    '</urlset>',
    ''
  ].join('\n'));
});

module.exports = router;

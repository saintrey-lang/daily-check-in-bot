import type { NextConfig } from 'next';

const config: NextConfig = {
  outputFileTracingIncludes: {
    '/api/cron/*': ['./assets/meme-font.ttf'],
    '/api/preview': ['./assets/meme-font.ttf'],
  },
};
export default config;

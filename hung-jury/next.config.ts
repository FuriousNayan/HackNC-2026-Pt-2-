import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // prompts/system.txt is read at runtime by the judge, so ship it with every server route.
  outputFileTracingIncludes: { '/*': ['./prompts/system.txt'] },
};

export default config;

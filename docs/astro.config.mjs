// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://snipsy.dev',
	integrations: [
		starlight({
			title: 'Snipsy',
			customCss: ['./src/styles/custom.css'],
			// Pagefind search indexing is skipped locally (windows-arm64 unsupported)
			// but works in CI (ubuntu). Set PAGEFIND=false to skip locally.
			pagefind: process.env.PAGEFIND !== 'false',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/sethjuarez/snipsy' },
			],
			sidebar: [
				{ label: 'Welcome', link: '/' },
				{
					label: 'Getting Started',
					autogenerate: { directory: 'getting-started' },
				},
				{
					label: 'Features',
					autogenerate: { directory: 'features' },
				},
				{
					label: 'Guides',
					autogenerate: { directory: 'guides' },
				},
			],
		}),
	],
});

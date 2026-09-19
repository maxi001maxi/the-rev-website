import fs from 'node:fs';
import path from 'node:path';

const BLOG_DIR = path.resolve('content/blog');

function frontMatterValue(source, key) {
  const pattern = new RegExp('^' + key + ':\\s*"?([^"\\n]+)"?\\s*$', 'm');
  const match = source.match(pattern);
  return match ? match[1].trim() : '';
}

export function publishedBlogPages() {
  if (!fs.existsSync(BLOG_DIR)) return [];

  return fs.readdirSync(BLOG_DIR)
    .filter((name) => name.endsWith('.md'))
    .map((name) => {
      const source = fs.readFileSync(path.join(BLOG_DIR, name), 'utf8');
      return {
        status: frontMatterValue(source, 'status'),
        slug: frontMatterValue(source, 'slug')
      };
    })
    .filter((item) => item.status === 'published' && /^[a-z0-9-]+$/.test(item.slug))
    .sort((a, b) => a.slug.localeCompare(b.slug))
    .map((item) => ({
      name: item.slug,
      url: `/blog/${item.slug}/`
    }));
}

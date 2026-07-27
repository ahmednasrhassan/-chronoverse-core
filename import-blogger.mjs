import fs from 'fs';
import { XMLParser } from 'fast-xml-parser';
import { createClient } from '@sanity/client';

const API_TOKEN = 'skrKrt1sL7YKzs7nzAjLQKpv7EAspKVWjjCf68Cr8LUlCpxOS2o7rrCPKPpuVOVRsBiEdvlt1k01UwANPa3of2u5Cfh1eFksdzVt99U5S5pETHXtb0h4KwwTVuqEE8UA1GfzdDO9Ls8TFuGMtzyVYGpp3YaaPx1fCRt0LCvtrCKM5X8gnw51';

const client = createClient({
  projectId: 'xfs4j01p',
  dataset: 'production',
  token: API_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
});

function cleanContent(html) {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/style="[^"]*"/gi, '')
    .trim();
}

async function importBloggerAsDrafts() {
  console.log('🧹 Cleaning up existing published posts...');
  
  // Delete previously imported published posts
  try {
    await client.delete({ query: '*[_type == "post"]' });
    console.log('🗑️ Successfully deleted published posts.');
  } catch (err) {
    console.log('⚠️ Cleanup notice:', err.message);
  }

  console.log('🚀 Re-importing posts as Drafts...');

  try {
    const xmlData = fs.readFileSync('./feed.atom', 'utf-8');
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
    });

    const result = parser.parse(xmlData);
    const entries = result.feed?.entry || [];

    let count = 0;

    for (const entry of entries) {
      const contentRaw = entry.content?.['#text'] || (typeof entry.content === 'string' ? entry.content : '');
      if (!contentRaw) continue;

      const title = entry.title?.['#text'] || (typeof entry.title === 'string' ? entry.title : 'Untitled Post');
      const cleanHtml = cleanContent(contentRaw);
      const publishedAt = entry.published || new Date().toISOString();

      const slug = title
        .toLowerCase()
        .replace(/[^\w\u0600-\u06FF\s-]/g, '')
        .replace(/\s+/g, '-')
        .slice(0, 90) || `post-${Date.now()}`;

      // Setting _id starting with "drafts." forces Sanity to create it as a draft
      const doc = {
        _id: `drafts.post-${count + 1}-${Date.now()}`,
        _type: 'post',
        title: title,
        slug: { _type: 'slug', current: slug },
        publishedAt: publishedAt,
        bodyRaw: cleanHtml,
      };

      try {
        await client.create(doc);
        count++;
        console.log(`📝 Saved as draft #${count}: ${title}`);
      } catch (err) {
        console.error(`❌ Error importing post (${title}):`, err.message);
      }
    }

    console.log(`🎉 Success! All ${count} posts are now saved as Drafts in Sanity.`);
  } catch (err) {
    console.error('❌ Error:', err.message);
  }
}

importBloggerAsDrafts();

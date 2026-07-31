import { createClient } from '@sanity/client';

const API_TOKEN = 'skrKrt1sL7YKzs7nzAjLQKpv7EAspKVWjjCf68Cr8LUlCpxOS2o7rrCPKPpuVOVRsBiEdvlt1k01UwANPa3of2u5Cfh1eFksdzVt99U5S5pETHXtb0h4KwwTVuqEE8UA1GfzdDO9Ls8TFuGMtzyVYGpp3YaaPx1fCRt0LCvtrCKM5X8gnw51';

const client = createClient({
  projectId: 'xfs4j01p',
  dataset: 'production',
  token: API_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
});

// دالة تنزيل الصورة مع حد أقصى 3 ثواني للرد
async function uploadImageToSanity(imageUrl) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 ثواني فقط

  try {
    const response = await fetch(imageUrl, { 
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });
    clearTimeout(timeoutId);

    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const asset = await client.assets.upload('image', buffer, {
      filename: imageUrl.split('/').pop().split('?')[0] || 'blogger-image.jpg',
    });

    return `${asset.url}?auto=format`;
  } catch (err) {
    clearTimeout(timeoutId);
    console.log(`   ⏩ Skipped slow image: ${imageUrl.slice(0, 40)}...`);
    return null;
  }
}

// دالة انتظار بسيط بين الصور عشان سيرفر جوجل ما يعلقش
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function migrateAllImages() {
  console.log('🚀 Starting Smart Image Migration (Safe Mode)...');

  const posts = await client.fetch(`*[_type in ["post", "page"]]{ _id, title, bodyRaw }`);
  console.log(`📄 Total documents: ${posts.length}`);

  let updatedCount = 0;

  for (const post of posts) {
    if (!post.bodyRaw) continue;

    const imgRegex = /https?:\/\/(?:[a-z0-9-]+\.)*(?:blogspot\.com|googleusercontent\.com)[^\s"'>]+/gi;
    const imageUrls = post.bodyRaw.match(imgRegex);

    if (!imageUrls || imageUrls.length === 0) continue;

    console.log(`\n📸 Processing ${imageUrls.length} image(s) for: "${post.title || post._id}"`);

    let updatedBody = post.bodyRaw;
    let hasChanges = false;
    const uniqueUrls = [...new Set(imageUrls)];

    for (const oldUrl of uniqueUrls) {
      if (oldUrl.includes('cdn.sanity.io')) continue;

      console.log(`   ⬇️ Downloading: ${oldUrl.slice(0, 45)}...`);
      const newSanityUrl = await uploadImageToSanity(oldUrl);

      if (newSanityUrl) {
        updatedBody = updatedBody.replaceAll(oldUrl, newSanityUrl);
        hasChanges = true;
      }
      
      await sleep(200); // انتظار 200 ملي ثانية بين كل صورة وصورة لعدم الحظر
    }

    if (hasChanges) {
      await client.patch(post._id).set({ bodyRaw: updatedBody }).commit();
      updatedCount++;
      console.log(`✅ Saved & updated: "${post.title || post._id}"`);
    }
  }

  console.log(`\n🎉 Done! ${updatedCount} posts updated successfully.`);
}

migrateAllImages();
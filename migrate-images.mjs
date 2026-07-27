import { createClient } from '@sanity/client';

const API_TOKEN = 'skrKrt1sL7YKzs7nzAjLQKpv7EAspKVWjjCf68Cr8LUlCpxOS2o7rrCPKPpuVOVRsBiEdvlt1k01UwANPa3of2u5Cfh1eFksdzVt99U5S5pETHXtb0h4KwwTVuqEE8UA1GfzdDO9Ls8TFuGMtzyVYGpp3YaaPx1fCRt0LCvtrCKM5X8gnw51';

const client = createClient({
  projectId: 'xfs4j01p',
  dataset: 'production',
  token: API_TOKEN,
  apiVersion: '2024-01-01',
  useCdn: false,
});

// Helper function to download an image and upload to Sanity CDN
async function uploadImageToSanity(imageUrl) {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return null;
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload image to Sanity Asset pipeline
    const asset = await client.assets.upload('image', buffer, {
      filename: imageUrl.split('/').pop().split('?')[0] || 'blogger-image.jpg',
    });

    // Appending `?auto=format` forces Sanity CDN to automatically deliver AVIF/WebP depending on user's browser support
    return `${asset.url}?auto=format`;
  } catch (err) {
    console.error(`⚠️ Failed to upload image (${imageUrl}):`, err.message);
    return null;
  }
}

async function migrateAllImages() {
  console.log('🚀 Fetching all posts and drafts to migrate images to Sanity CDN with WebP/AVIF support...');

  // Fetch all posts and drafts
  const posts = await client.fetch(`*[_type == "post"]{ _id, title, bodyRaw }`);
  console.log(`📄 Found ${posts.length} posts.`);

  let updatedCount = 0;

  for (const post of posts) {
    if (!post.bodyRaw) continue;

    // Regex to detect Blogger and Google Hosted image links
    const imgRegex = /https?:\/\/(?:[a-z0-9-]+\.)*(?:blogspot\.com|googleusercontent\.com)[^\s"'>]+/gi;
    const imageUrls = post.bodyRaw.match(imgRegex);

    if (!imageUrls || imageUrls.length === 0) continue;

    console.log(`📸 Processing ${imageUrls.length} image(s) in post: "${post.title}"`);

    let updatedBody = post.bodyRaw;
    let hasChanges = false;

    // Remove duplicates within the same post
    const uniqueUrls = [...new Set(imageUrls)];

    for (const oldUrl of uniqueUrls) {
      console.log(`   ⬇️ Downloading & Converting: ${oldUrl.slice(0, 50)}...`);
      const newSanityUrl = await uploadImageToSanity(oldUrl);

      if (newSanityUrl) {
        // Replace old Blogger URL with Optimized Sanity CDN WebP/AVIF URL
        updatedBody = updatedBody.replaceAll(oldUrl, newSanityUrl);
        hasChanges = true;
      }
    }

    if (hasChanges) {
      // Save changes back to Sanity
      await client.patch(post._id).set({ bodyRaw: updatedBody }).commit();
      updatedCount++;
      console.log(`✅ Successfully updated & optimized images for post: "${post.title}"`);
    }
  }

  console.log(`🎉 Done! Images for ${updatedCount} posts have been uploaded to Sanity CDN with WebP/AVIF optimization.`);
  console.log('🔒 You can now safely close or delete your Blogger blog without losing images!');
}

migrateAllImages();
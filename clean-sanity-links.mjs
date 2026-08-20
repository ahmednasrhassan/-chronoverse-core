import { createClient } from "@sanity/client";

const client = createClient({
  projectId: "xfs4j01p",
  dataset: "production",
  apiVersion: "2024-01-01",
  token: "sk5q3mk6sJ4MNawnGIEDdzLPKLgagdTOww7M6TmbMmIaLDKxbkASdt3lE1hGs4GEKMYmzq6XmCXd3aN62UlpYAshRecMbiQBtiLYwYEBta42ICNzaOE8Y48HGljUupQB79wWcQXJboCEkBYyJqEJm7vvUMQ1etRYDn1mWYS4VQhRs7XAFHLm",
  useCdn: false,
});

function removeLinksRecursively(obj) {
  let hasChanges = false;

  if (!obj) return { data: obj, hasChanges: false };

  // إذا كان النص يحتوي على روابط HTML من نوع <a href...>
  if (typeof obj === "string") {
    const cleaned = obj.replace(/<a\b[^>]*>(.*?)<\/a>/gi, "$1");
    return { data: cleaned, hasChanges: cleaned !== obj };
  }

  // إذا كان كائن Portable Text يحتوي على علامات markDefs من نوع link
  if (Array.isArray(obj)) {
    const newArr = obj.map((item) => {
      const res = removeLinksRecursively(item);
      if (res.hasChanges) hasChanges = true;
      return res.data;
    });
    return { data: newArr, hasChanges };
  }

  if (typeof obj === "object") {
    const newObj = { ...obj };

    // تنظيف Portable Text block marks (روابط Sanity)
    if (newObj._type === "block" && Array.isArray(newObj.markDefs)) {
      if (newObj.markDefs.length > 0) {
        newObj.markDefs = [];
        hasChanges = true;
      }
    }

    for (const key of Object.keys(newObj)) {
      if (key.startsWith("_")) continue; // نادراً ما نغير الخصائص النظامية
      const res = removeLinksRecursively(newObj[key]);
      if (res.hasChanges) {
        newObj[key] = res.data;
        hasChanges = true;
      }
    }
    return { data: newObj, hasChanges };
  }

  return { data: obj, hasChanges: false };
}

async function startCleaning() {
  console.log("🚀 Inspecting and cleaning ALL fields in 148 documents...");
  try {
    const docs = await client.fetch(`*[_type in ["post", "article", "dossier", "doc"]]`);
    console.log(`📦 Fetched ${docs.length} documents.`);

    let cleanedCount = 0;

    for (const doc of docs) {
      const { data: cleanedDoc, hasChanges } = removeLinksRecursively(doc);

      if (hasChanges) {
        console.log(`🧹 Cleaning document: ${doc.title || doc._id}...`);
        await client.createOrReplace(cleanedDoc);
        cleanedCount++;
      }
    }

    if (cleanedCount === 0) {
      console.log("\n✨ Perfect news! No external links were found. All 148 articles are already 100% CLEAN!");
    } else {
      console.log(`\n✅ Done! Successfully cleaned ${cleanedCount} documents.`);
    }
  } catch (err) {
    console.error("❌ Error:", err.message || err);
  }
}

startCleaning();
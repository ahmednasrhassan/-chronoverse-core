import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

type SanityWebhookBody = {
  _type?: string;
  slug?: string | null;
};

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    if (secret !== process.env.SANITY_REVALIDATE_SECRET) {
      return NextResponse.json({ message: 'Invalid secret' }, { status: 401 });
    }

    let body: SanityWebhookBody = {};

    try {
      body = (await request.json()) as SanityWebhookBody;
    } catch {
      // Keep the webhook resilient even if Sanity sends no JSON body.
    }

    const slug =
      typeof body.slug === 'string' && body.slug.trim().length > 0
        ? body.slug.trim()
        : null;

    revalidatePath('/');
    revalidatePath('/reports');
    revalidatePath('/archive');
    revalidatePath('/sitemap.xml');
    revalidatePath('/feed.xml');
    revalidatePath('/rss.xml');

    if (slug) {
      revalidatePath(`/${slug}`);
    } else {
      revalidatePath('/[slug]', 'page');
    }

    revalidatePath('/category/[slug]', 'page');

    return NextResponse.json({
      revalidated: true,
      slug,
      now: Date.now(),
    });
  } catch (err) {
    console.error('[Sanity revalidate] Failed:', err);
    return NextResponse.json({ message: 'Error revalidating' }, { status: 500 });
  }
}
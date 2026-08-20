import { revalidatePath } from 'next/cache';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const secret = searchParams.get('secret');

    if (secret !== process.env.SANITY_REVALIDATE_SECRET) {
      return NextResponse.json({ message: 'Invalid secret' }, { status: 401 });
    }

    revalidatePath('/');
    revalidatePath('/[slug]', 'page');

    return NextResponse.json({ revalidated: true, now: Date.now() });
  } catch (err) {
    return NextResponse.json({ message: 'Error revalidating' }, { status: 500 });
  }
}
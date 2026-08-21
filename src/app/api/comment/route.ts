import { NextResponse } from "next/server";
import { createClient } from "next-sanity";

const client = createClient({
  projectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID,
  dataset: process.env.NEXT_PUBLIC_SANITY_DATASET || "production",
  apiVersion: "2024-01-01",
  useCdn: false,
  token: process.env.SANITY_API_WRITE_TOKEN || process.env.SANITY_API_TOKEN,
});

export async function POST(req: Request) {
  try {
    const { name, email, comment, postId } = await req.json();

    if (!name || !email || !comment || !postId) {
      return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
    }

    await client.create({
      _type: "comment",
      post: {
        _type: "reference",
        _ref: postId,
      },
      name,
      email,
      comment,
      approved: false,
    });

    return NextResponse.json({ message: "Comment submitted successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ message: "Error submitting comment", error }, { status: 500 });
  }
}
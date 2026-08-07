import { defineType, defineField } from 'sanity'

/**
 * Post schema — editorial/blog content only.
 *
 * NOTE: Administrative/static content (About, Privacy Policy, etc.) lives in
 * the separate `page` schema (see `./page.ts`). Keeping the two document
 * types distinct lets the Studio sidebar, GROQ queries, and the sitemap
 * treat blog posts and administrative pages differently for SEO purposes
 * (posts are indexed as articles with `changeFrequency: weekly`, pages as
 * low-frequency evergreen content).
 */
export default defineType({
  name: 'post',
  title: 'Post',
  type: 'document',
  groups: [
    { name: 'content', title: 'Content', default: true },
    { name: 'seo', title: 'SEO & Metadata' },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      group: 'content',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'content',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'publishedAt',
      title: 'Published At (Schedule)',
      type: 'datetime',
      group: 'content',
      description: 'Set a future date to schedule publishing.',
    }),
    defineField({
      name: 'author',
      title: 'Author',
      type: 'reference',
      to: { type: 'author' },
      group: 'content',
    }),
    // Singular reference (not an array) so that GROQ `category->title` /
    // `category->slug.current` projections used throughout the site resolve
    // correctly.
    defineField({
      name: 'category',
      title: 'Category',
      type: 'reference',
      to: { type: 'category' },
      group: 'content',
      description:
        'Required. If a post somehow ends up without a category, the site automatically falls back to "General" — but every post should be assigned a real category for accurate SEO and navigation.',
      validation: (Rule) =>
        Rule.warning(
          'No category assigned. This post will display under the default "General" category on the live site until one is set.'
        ),
    }),
    defineField({
      name: 'tags',
      title: 'Tags / Keywords',
      type: 'array',
      of: [{ type: 'string' }],
      group: 'content',
      options: { layout: 'tags' },
      description:
        'Used to power automated internal linking ("Related Articles") when posts share a category or overlapping tags.',
    }),
    defineField({
      name: 'mainImage',
      title: 'Main Image',
      type: 'image',
      group: 'content',
      options: { hotspot: true },
    }),
    defineField({
      name: 'excerpt',
      title: 'Excerpt / Rich Summary',
      type: 'text',
      rows: 3,
      group: 'seo',
      description:
        'Short summary for previews. Can be auto-generated via "Generate SEO & Excerpt (AI)".',
    }),
    defineField({
      name: 'seoDescription',
      title: 'SEO Meta Description',
      type: 'text',
      rows: 2,
      group: 'seo',
      description:
        'Search-engine meta description (max ~160 chars). Can be auto-generated via "Generate SEO & Excerpt (AI)". If left empty, the site automatically falls back to the first 160 characters of the article body.',
    }),
    defineField({
      name: 'body',
      title: 'Body Content',
      type: 'array',
      group: 'content',
      of: [
        { type: 'block' },
        { type: 'image', options: { hotspot: true } },
      ],
    }),
    // Legacy field retained to preserve data migrated from Blogger.
    defineField({
      name: 'bodyRaw',
      title: 'Legacy Body (HTML)',
      type: 'text',
      group: 'content',
      description: 'Raw HTML from Blogger migration.',
      readOnly: false,
    }),
  ],
  preview: {
    select: {
      title: 'title',
      author: 'author.name',
      category: 'category.title',
      media: 'mainImage',
    },
    prepare(selection) {
      const { author, category } = selection
      const bits = [author && `by ${author}`, category || 'Uncategorized'].filter(Boolean)
      return { ...selection, subtitle: bits.join(' · ') }
    },
  },
})

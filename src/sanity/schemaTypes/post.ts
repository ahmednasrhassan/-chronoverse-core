import { defineType, defineField } from 'sanity'
import { MarkdownPasteInput } from '../components/MarkdownPasteInput'

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
      validation: (Rule) =>
        Rule.required().warning(
          'Aim for under ~60 characters — longer titles get truncated in Google search results and in the auto-generated <title> tag (see optimizedTitle logic in the article page template).'
        ),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      group: 'content',
      options: {
        source: 'title',
        maxLength: 96,
        slugify: (input) =>
          input
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)+/g, '')
            .slice(0, 96),
      },
      validation: (Rule) =>
        Rule.required().custom((slug) => {
          if (!slug?.current) return true;
          // Keep slugs limited to lowercase letters, numbers, and hyphens —
          // matches the URL format every route/query in the app (sitemap,
          // category matching, canonical URLs) assumes.
          const isValidFormat = /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug.current);
          return isValidFormat
            ? true
            : 'Slug must be lowercase letters, numbers, and hyphens only (e.g. "my-article-title").';
        }),
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
      validation: (Rule) =>
        Rule.max(160).warning(
          'Descriptions over ~160 characters get truncated by Google — the automated truncateForSEO() logic in the article page will cut it anyway, so it is worth trimming manually for a cleaner result.'
        ),
    }),
    defineField({
      name: 'body',
      title: 'Body Content',
      type: 'array',
      group: 'content',
      // Adds a "Paste Markdown" button above the normal block editor —
      // paste a plain Markdown article and it converts to structured
      // blocks (H2-H6, bold, italic, blockquotes) automatically, right
      // inside the Studio. See components/MarkdownPasteInput.tsx.
      components: {
        input: MarkdownPasteInput,
      },
      of: [
        {
          type: 'block',
          // H1 is intentionally NOT offered here. The article's <h1> is
          // always the post `title` rendered once by the page template
          // (see UniversalArticlePage in app/(site)/[slug]/page.tsx) — if
          // editors could also pick "H1" for a heading inside the body,
          // the page would end up with two <h1> tags, which hurts SEO and
          // accessibility (a page should have exactly one H1). Headings
          // inside the article body must start at H2 and can go down to
          // H6, giving editors a full, correct heading hierarchy under
          // the single page-level H1.
          styles: [
            { title: 'Normal', value: 'normal' },
            { title: 'H2', value: 'h2' },
            { title: 'H3', value: 'h3' },
            { title: 'H4', value: 'h4' },
            { title: 'H5', value: 'h5' },
            { title: 'H6', value: 'h6' },
            { title: 'Quote', value: 'blockquote' },
          ],
        },
        { type: 'image', options: { hotspot: true } },
      ],
    }),
    // Legacy field retained to preserve data migrated from Blogger.
    defineField({
      name: 'bodyRaw',
      title: 'Legacy Body (HTML)',
      type: 'text',
      group: 'content',
      description:
        'Raw HTML from Blogger migration. Any <h1> tags inside this HTML are automatically downgraded to <h2> at render time (see downgradeHeadings in src/lib/content.ts) so they never conflict with the page-level H1 (the post title).',
      readOnly: false,
    }),
    // Manual internal-linking override. When an editor explicitly picks
    // related posts here, the front-end prioritizes these links over the
    // automated relevance-scoring engine (see `src/lib/relatedArticles.ts`).
    defineField({
      name: 'manualRelatedLinks',
      title: 'Manual Related / Internal Links',
      type: 'array',
      group: 'content',
      of: [{ type: 'reference', to: { type: 'post' } }],
      description:
        'Optional. If you manually select related posts here, they take priority over the automated "Related Intelligence" internal-linking block. Leave empty to let the site auto-select the 8 most relevant articles.',
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
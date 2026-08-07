import { defineType, defineField } from 'sanity'

/**
 * Page schema — Administrative / static pages only (About, Privacy Policy,
 * Terms of Service, FAQ, Disclaimer, DMCA, Editorial Policy, Manifesto,
 * Contact, Sponsors, etc.).
 *
 * This is intentionally kept distinct from `post.ts` (blog/editorial
 * content) so:
 *  - The Sanity Studio sidebar can list "Pages" separately from "Posts".
 *  - GROQ queries and the sitemap can route `_type == "page"` documents
 *    differently from `_type == "post"` documents (e.g. different
 *    changeFrequency/priority, no "related articles" box, no author byline).
 */
export default defineType({
  name: 'page',
  title: 'Administrative Pages',
  type: 'document',
  groups: [
    { name: 'content', title: 'Content', default: true },
    { name: 'seo', title: 'SEO & Metadata' },
  ],
  fields: [
    defineField({
      name: 'title',
      title: 'Page Title',
      type: 'string',
      group: 'content',
      description: 'The title of the page (e.g., About Us, Privacy Policy).',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'URL Slug',
      type: 'slug',
      group: 'content',
      description: 'The URL path for this page (e.g., about, privacy-policy).',
      options: {
        source: 'title',
        maxLength: 96,
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'mainImage',
      title: 'Main Header Image',
      type: 'image',
      group: 'content',
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'content',
      title: 'Page Content',
      type: 'array',
      group: 'content',
      description: 'The main text and images of the page.',
      of: [
        { type: 'block' },
        { type: 'image' },
      ],
    }),
    defineField({
      name: 'seoDescription',
      title: 'SEO Meta Description',
      type: 'text',
      rows: 2,
      group: 'seo',
      description:
        'Search-engine meta description (max ~160 chars). Falls back to the first 160 characters of the page content if left empty.',
    }),
  ],
  preview: {
    select: {
      title: 'title',
      media: 'mainImage',
    },
    prepare(selection) {
      return { ...selection, subtitle: 'Administrative Page' }
    },
  },
})

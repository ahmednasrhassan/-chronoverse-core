import { defineType, defineField } from 'sanity'

/**
 * Category schema — referenced by `post` documents. A "General" category
 * (slug: `general`) should always exist so that posts left uncategorized by
 * an editor can safely fall back to it (see `src/lib/content.ts`), which
 * prevents broken `/category/[slug]` links and empty category badges on the
 * front end.
 */
export default defineType({
  name: 'category',
  title: 'Category',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Title',
      type: 'string',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      description:
        'Used to build the /category/[slug] URL. Should match the imported Blogger label (kebab-case).',
      options: { source: 'title', maxLength: 96 },
      validation: (Rule) =>
        Rule.required().custom((slug) => {
          if (!slug?.current) return true
          return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug.current)
            ? true
            : 'Slug must contain lowercase letters, numbers, and single hyphens only.'
        }),
    }),
    defineField({
      name: 'description',
      title: 'Description',
      type: 'text',
    }),
  ],
  preview: {
    select: { title: 'title', slug: 'slug.current' },
    prepare({ title, slug }) {
      return { title, subtitle: slug ? `/category/${slug}` : 'Slug required' }
    },
  },
})

import { defineType, defineField } from 'sanity'

export default defineType({
  name: 'page',
  title: 'Administrative Pages',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      title: 'Page Title',
      type: 'string',
      description: 'The title of the page (e.g., About Us, Privacy Policy).',
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: 'slug',
      title: 'URL Slug',
      type: 'slug',
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
      options: {
        hotspot: true,
      },
    }),
    defineField({
      name: 'content',
      title: 'Page Content',
      type: 'array',
      description: 'The main text and images of the page.',
      of: [
        { type: 'block' },
        { type: 'image' }
      ],
    }),
  ],
})
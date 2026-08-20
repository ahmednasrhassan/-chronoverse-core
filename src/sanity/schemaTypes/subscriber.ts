import { defineType, defineField } from 'sanity'

/**
 * Subscriber schema — stores newsletter subscriber email addresses
 * captured via the `/api/newsletter` subscription endpoint
 * (newsletter.chronoversecapital.com). Read by the
 * `/api/cron/send-newsletter` Vercel Cron job to build the daily
 * distribution list for the automated RSS -> Amazon SES newsletter
 * dispatch.
 */
export default defineType({
  name: 'subscriber',
  title: 'Newsletter Subscriber',
  type: 'document',
  fields: [
    defineField({
      name: 'email',
      title: 'Email',
      type: 'string',
      validation: (Rule) => Rule.required().email(),
    }),
    defineField({
      name: 'subscribedAt',
      title: 'Subscribed At',
      type: 'datetime',
      initialValue: () => new Date().toISOString(),
    }),
    defineField({
      name: 'active',
      title: 'Active',
      type: 'boolean',
      description: 'Unchecked automatically when a subscriber unsubscribes.',
      initialValue: true,
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      description: 'Where this subscriber signed up (e.g. newsletter.chronoversecapital.com).',
    }),
  ],
  preview: {
    select: {
      title: 'email',
      subtitle: 'subscribedAt',
    },
  },
})

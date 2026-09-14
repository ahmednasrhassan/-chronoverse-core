import { defineType, defineField } from 'sanity'

/**
 * Subscriber schema — stores newsletter subscriber email addresses
 * captured via the canonical `/newsletter` subscription page. Read by the
 * `/api/cron/send-newsletter` Vercel Cron job to build the daily
 * distribution list for the automated Amazon SES newsletter dispatch.
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
      description:
        'Controls delivery eligibility. A repeat subscription reactivates an inactive record.',
      initialValue: true,
    }),
    defineField({
      name: 'source',
      title: 'Source',
      type: 'string',
      description: 'Signup source path, normally chronoversecapital.com/newsletter.',
    }),
  ],
  preview: {
    select: {
      title: 'email',
      subtitle: 'subscribedAt',
    },
  },
})

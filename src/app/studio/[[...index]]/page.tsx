'use client'

import { NextStudio } from 'next-sanity/studio'
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import type { StructureBuilder } from 'sanity/structure'
import { dashboardTool } from '@sanity/dashboard'
import { Icon } from '@sanity/icons'

import { generateSeoAction } from '@/sanity/actions/generateSeoAction'
import { QuickDraftsWidget } from '@/sanity/dashboard/QuickDraftsWidget'
import { RecentContentWidget } from '@/sanity/dashboard/RecentContentWidget'
import { ImageAssetsWidget } from '@/sanity/dashboard/ImageAssetsWidget'
import { ContentStatsWidget } from '@/sanity/dashboard/ContentStatsWidget'

import postSchema from '@/sanity/schemaTypes/post'
import pageSchema from '@/sanity/schemaTypes/page'
import authorSchema from '@/sanity/schemaTypes/author'
import categorySchema from '@/sanity/schemaTypes/category'

const deskStructure = (S: StructureBuilder) =>
  S.list()
    .title('Content')
    .items([
      S.listItem()
        .title('Posts')
        .icon(() => <Icon symbol="document" />)
        .child(
          S.documentTypeList('post')
            .title('Posts')
            .defaultOrdering([{ field: 'publishedAt', direction: 'desc' }])
        ),
      S.listItem()
        .title('Pages')
        .icon(() => <Icon symbol="folder" />)
        .child(
          S.documentTypeList('page')
            .title('Administrative Pages')
            .defaultOrdering([{ field: 'title', direction: 'asc' }])
        ),
      S.divider(),
      S.listItem()
        .title('Authors')
        .icon(() => <Icon symbol="user" />)
        .child(S.documentTypeList('author').title('Authors')),
      S.listItem()
        .title('Categories')
        .icon(() => <Icon symbol="tag" />)
        .child(S.documentTypeList('category').title('Categories')),
    ])

const config = defineConfig({
  projectId: 'xfs4j01p',
  dataset: 'production',
  title: 'Chronoverse Capital Admin',
  basePath: '/studio',
  plugins: [
    structureTool({
      structure: deskStructure,
    }),
    dashboardTool({
      name: 'dashboard',
      title: 'Dashboard',
      icon: () => <Icon symbol="dashboard" />,
      widgets: [
        { name: 'quick-drafts', component: QuickDraftsWidget, layout: { width: 'medium' } },
        { name: 'recent-content', component: RecentContentWidget, layout: { width: 'medium' } },
        { name: 'image-assets', component: ImageAssetsWidget, layout: { width: 'medium' } },
        { name: 'content-stats', component: ContentStatsWidget, layout: { width: 'full' } },
      ],
    }),
  ],
  schema: {
    types: [postSchema, pageSchema, authorSchema, categorySchema],
  },
  document: {
    actions: (prev, context) => {
      if (context.schemaType === 'post') {
        return [
          generateSeoAction,
          (props) => {
            const slugObj = (props.published?.slug || props.draft?.slug) as { current?: string } | undefined
            const slug = slugObj?.current
            return {
              label: 'Open Article 🔗',
              onHandle: () => {
                if (slug) {
                  window.open(`https://chronoversecapital.com/${slug}`, '_blank')
                } else {
                  alert('Please generate or set a slug first!')
                }
              },
            }
          },
          (props) => {
            const slugObj = (props.published?.slug || props.draft?.slug) as { current?: string } | undefined
            const slug = slugObj?.current
            return {
              label: 'Copy Link 📋',
              onHandle: () => {
                if (slug) {
                  const url = `https://chronoversecapital.com/${slug}`
                  navigator.clipboard.writeText(url)
                  alert('Article link copied to clipboard!')
                } else {
                  alert('Please generate or set a slug first!')
                }
              },
            }
          },
          ...prev,
        ]
      }
      return prev
    },
  },
})

export default function StudioPage() {
  return <NextStudio config={config} />
}
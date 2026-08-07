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

// Editorial (post) vs. Administrative (page) content types now live in
// dedicated schema files under `src/sanity/schemaTypes/` so they can be
// grouped separately in the Studio sidebar and queried independently via
// `_type == "post"` / `_type == "page"` in GROQ across the Next.js routes.
import postSchema from '@/sanity/schemaTypes/post'
import pageSchema from '@/sanity/schemaTypes/page'
import authorSchema from '@/sanity/schemaTypes/author'
import categorySchema from '@/sanity/schemaTypes/category'

// ==========================================
// Desk Structure — explicit "Posts" vs "Pages" sidebar sections.
//
// This deliberately does NOT use S.documentTypeListItems() (which would
// render every schema type as one flat list). Instead we build two named
// list items — "Posts" (blog/editorial content) and "Pages" (administrative
// content, e.g. About, Privacy Policy) — followed by the supporting
// reference types (Authors, Categories), so editors can never confuse the
// two content models.
// ==========================================
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

// ==========================================
// Configuration & Initialization
// ==========================================
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
        return [generateSeoAction, ...prev]
      }
      return prev
    },
  },
})

export default function StudioPage() {
  return <NextStudio config={config} />
}

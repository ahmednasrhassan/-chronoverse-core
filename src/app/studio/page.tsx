'use client'

import { NextStudio } from 'next-sanity/studio'
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'
import { dashboardTool } from '@sanity/dashboard'
import { Icon } from '@sanity/icons'

import { generateSeoAction } from '@/sanity/actions/generateSeoAction'
import { QuickDraftsWidget } from '@/sanity/dashboard/QuickDraftsWidget'
import { RecentContentWidget } from '@/sanity/dashboard/RecentContentWidget'
import { ImageAssetsWidget } from '@/sanity/dashboard/ImageAssetsWidget'
import { ContentStatsWidget } from '@/sanity/dashboard/ContentStatsWidget'

// ==========================================
// 1. Author Schema (المؤلفين)
// ==========================================
const authorSchema = {
  name: 'author',
  title: 'Author',
  type: 'document',
  fields: [
    { name: 'name', title: 'Name', type: 'string' },
    { name: 'slug', title: 'Slug', type: 'slug', options: { source: 'name' } },
    { name: 'image', title: 'Image', type: 'image', options: { hotspot: true } },
    { name: 'bio', title: 'Bio', type: 'array', of: [{ type: 'block' }] },
  ],
}

// ==========================================
// 2. Category Schema (التصنيفات)
// ==========================================
const categorySchema = {
  name: 'category',
  title: 'Category',
  type: 'document',
  fields: [
    { name: 'title', title: 'Title', type: 'string', validation: (Rule: any) => Rule.required() },
    {
      name: 'slug',
      title: 'Slug',
      type: 'slug',
      options: { source: 'title', maxLength: 96 },
      description: 'Used to build the /category/[slug] URL. Should match the imported Blogger label (kebab-case).',
      validation: (Rule: any) => Rule.required(),
    },
    { name: 'description', title: 'Description', type: 'text' },
  ],
}


// ==========================================
// 3. Post Schema (المقالات - شامل وكامل)
// ==========================================
const postSchema = {
  name: 'post',
  title: 'Post',
  type: 'document',
  fields: [
    // البيانات الأساسية
    { name: 'title', title: 'Title', type: 'string', validation: (Rule: any) => Rule.required() },
    { name: 'slug', title: 'Slug', type: 'slug', options: { source: 'title', maxLength: 96 }, validation: (Rule: any) => Rule.required() },
    
    // النشر والجدولة
    { name: 'publishedAt', title: 'Published At (Schedule)', type: 'datetime', description: 'Set a future date to schedule publishing.' },
    
    // العلاقات
    { name: 'author', title: 'Author', type: 'reference', to: { type: 'author' } },
    // NOTE: Singular reference (not an array) so that GROQ `category->title` /
    // `category->slug.current` projections used throughout the site resolve correctly.
    { name: 'category', title: 'Category', type: 'reference', to: { type: 'category' } },

    
    // الميديا والملخص
    { name: 'mainImage', title: 'Main Image', type: 'image', options: { hotspot: true } },
    { name: 'excerpt', title: 'Excerpt / Rich Summary', type: 'text', rows: 3, description: 'Short summary for previews. Can be auto-generated via "Generate SEO & Excerpt (AI)".' },
    { name: 'seoDescription', title: 'SEO Meta Description', type: 'text', rows: 2, description: 'Search-engine meta description (max ~160 chars). Can be auto-generated via "Generate SEO & Excerpt (AI)".' },
    
    // المحتوى (المحرر القوي)
    { 
      name: 'body', 
      title: 'Body Content', 
      type: 'array', 
      of: [
        { type: 'block' }, // النصوص والتنسيقات
        { type: 'image', options: { hotspot: true } }, // إدراج صور داخل النص
      ] 
    },

    // الحقل القديم (للحفاظ على البيانات المهاجرة من بلوجر)
    { name: 'bodyRaw', title: 'Legacy Body (HTML)', type: 'text', description: 'Raw HTML from Blogger migration.', readOnly: false },
  ],
  preview: {
    select: {
      title: 'title',
      author: 'author.name',
      media: 'mainImage',
    },
    prepare(selection: any) {
      const { author } = selection
      return { ...selection, subtitle: author && `by ${author}` }
    },
  },
}

// ==========================================
// 4. Page Schema (الصفحات الثابتة مثل من نحن، الخ)
// ==========================================
const pageSchema = {
  name: 'page',
  title: 'Page',
  type: 'document',
  fields: [
    { name: 'title', title: 'Title', type: 'string' },
    { name: 'slug', title: 'Slug', type: 'slug', options: { source: 'title' } },
    { name: 'body', title: 'Body', type: 'array', of: [{ type: 'block' }, { type: 'image' }] },
  ],
}

// ==========================================
// 5. Configuration & Initialization
// ==========================================
const config = defineConfig({
  projectId: 'xfs4j01p',
  dataset: 'production',
  title: 'Chronoverse Capital Admin',
  basePath: '/studio',
  plugins: [
    structureTool(),
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
    types: [postSchema, authorSchema, categorySchema, pageSchema],
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

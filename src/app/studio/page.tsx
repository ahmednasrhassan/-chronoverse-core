'use client'

import { NextStudio } from 'next-sanity/studio'
import { defineConfig } from 'sanity'
import { structureTool } from 'sanity/structure'

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
    { name: 'title', title: 'Title', type: 'string' },
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
    { name: 'categories', title: 'Categories', type: 'array', of: [{ type: 'reference', to: { type: 'category' } }] },
    
    // الميديا والملخص
    { name: 'mainImage', title: 'Main Image', type: 'image', options: { hotspot: true } },
    { name: 'excerpt', title: 'Excerpt / SEO Description', type: 'text', rows: 3, description: 'Short summary for SEO and previews.' },
    
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
  plugins: [structureTool()],
  schema: {
    types: [postSchema, authorSchema, categorySchema, pageSchema],
  },
})

export default function StudioPage() {
  return <NextStudio config={config} />
}
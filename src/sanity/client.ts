import { createClient } from 'next-sanity'

export const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'xfs4j01p'
export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production'
export const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2024-03-01'

export const client = createClient({
  projectId,
  dataset,
  apiVersion,
  useCdn: true,
})

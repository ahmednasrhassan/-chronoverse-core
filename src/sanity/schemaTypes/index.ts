import post from './post'
import page from './page'
import author from './author'
import category from './category'
import subscriber from './subscriber'
import { comment } from './comment'

/**
 * Central schema registry for Sanity Studio.
 *
 * `post` = editorial/blog content, `page` = administrative/static content.
 * Kept as separate top-level exports so the desk structure (see
 * `src/app/studio/page.tsx`) can group them into distinct "Posts" and
 * "Pages" sections in the sidebar.
 */
export const schemaTypes = [post, page, author, category, subscriber, comment]

export default schemaTypes
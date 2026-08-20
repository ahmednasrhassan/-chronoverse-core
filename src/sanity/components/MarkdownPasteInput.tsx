import React, { useState, useCallback } from 'react'
import { ArrayOfObjectsInputProps, set } from 'sanity'
import { Stack, Button, Dialog, TextArea, Card, Text, Box, Flex } from '@sanity/ui'

interface SpanChild {
  _key: string
  _type: 'span'
  text: string
  marks: string[]
}

interface BlockNode {
  _key: string
  _type: 'block'
  style: 'normal' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'blockquote'
  listItem?: 'bullet' | 'number'
  level?: number
  markDefs: any[]
  children: SpanChild[]
}

function generateKey(): string {
  return Math.random().toString(36).substring(2, 10)
}

/**
 * Tokenizes an inline string into Portable Text spans supporting
 * bold (**text**), italic (*text*), and inline code (`text`).
 */
function parseInlineSpans(rawText: string): SpanChild[] {
  const spans: SpanChild[] = []
  const tokenRegex = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|[^*`]+)/g
  let match: RegExpExecArray | null

  while ((match = tokenRegex.exec(rawText)) !== null) {
    const chunk = match[0]
    if (!chunk) continue

    if (chunk.startsWith('**') && chunk.endsWith('**') && chunk.length >= 4) {
      spans.push({
        _key: generateKey(),
        _type: 'span',
        text: chunk.slice(2, -2),
        marks: ['strong'],
      })
    } else if (chunk.startsWith('*') && chunk.endsWith('*') && chunk.length >= 2) {
      spans.push({
        _key: generateKey(),
        _type: 'span',
        text: chunk.slice(1, -1),
        marks: ['em'],
      })
    } else if (chunk.startsWith('`') && chunk.endsWith('`') && chunk.length >= 2) {
      spans.push({
        _key: generateKey(),
        _type: 'span',
        text: chunk.slice(1, -1),
        marks: ['code'],
      })
    } else {
      spans.push({
        _key: generateKey(),
        _type: 'span',
        text: chunk,
        marks: [],
      })
    }
  }

  return spans.length > 0
    ? spans
    : [{ _key: generateKey(), _type: 'span', text: rawText, marks: [] }]
}

/**
 * Parses raw Markdown text into structured Sanity Portable Text blocks.
 * Enforces architectural SEO standards: any H1 (#) is automatically downgraded
 * to H2 to ensure the document contains only one single H1 (the page title).
 */
function parseMarkdownToBlocks(markdown: string): BlockNode[] {
  const lines = markdown.split(/\r?\n/)
  const blocks: BlockNode[] = []
  let paragraphBuffer: string[] = []

  const flushParagraphBuffer = () => {
    if (paragraphBuffer.length > 0) {
      const combinedText = paragraphBuffer.join(' ').trim()
      if (combinedText) {
        blocks.push({
          _key: generateKey(),
          _type: 'block',
          style: 'normal',
          markDefs: [],
          children: parseInlineSpans(combinedText),
        })
      }
      paragraphBuffer = []
    }
  }

  for (const line of lines) {
    const trimmed = line.trim()

    // Skip empty lines and Markdown horizontal rules
    if (!trimmed || trimmed === '---' || trimmed === '***' || trimmed === '___') {
      flushParagraphBuffer()
      continue
    }

    // Markdown Headers: # to ######
    if (trimmed.startsWith('#')) {
      flushParagraphBuffer()
      const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
      if (headerMatch) {
        const hashes = headerMatch[1].length
        const headerContent = headerMatch[2].trim()

        let style: 'h2' | 'h3' | 'h4' | 'h5' | 'h6' = 'h2'
        if (hashes === 1 || hashes === 2) style = 'h2'
        else if (hashes === 3) style = 'h3'
        else if (hashes === 4) style = 'h4'
        else if (hashes === 5) style = 'h5'
        else if (hashes >= 6) style = 'h6'

        blocks.push({
          _key: generateKey(),
          _type: 'block',
          style,
          markDefs: [],
          children: parseInlineSpans(headerContent),
        })
        continue
      }
    }

    // Blockquotes: > quote
    if (trimmed.startsWith('>')) {
      flushParagraphBuffer()
      const quoteContent = trimmed.replace(/^>\s*/, '').trim()
      blocks.push({
        _key: generateKey(),
        _type: 'block',
        style: 'blockquote',
        markDefs: [],
        children: parseInlineSpans(quoteContent),
      })
      continue
    }

    // Unordered Lists: * or -
    if (/^[\*\-]\s+/.test(trimmed)) {
      flushParagraphBuffer()
      const listContent = trimmed.replace(/^[\*\-]\s+/, '').trim()
      blocks.push({
        _key: generateKey(),
        _type: 'block',
        style: 'normal',
        listItem: 'bullet',
        level: 1,
        markDefs: [],
        children: parseInlineSpans(listContent),
      })
      continue
    }

    // Ordered Lists: 1., 2., etc.
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraphBuffer()
      const listContent = trimmed.replace(/^\d+\.\s+/, '').trim()
      blocks.push({
        _key: generateKey(),
        _type: 'block',
        style: 'normal',
        listItem: 'number',
        level: 1,
        markDefs: [],
        children: parseInlineSpans(listContent),
      })
      continue
    }

    // Regular text line
    paragraphBuffer.push(trimmed)
  }

  flushParagraphBuffer()
  return blocks
}

export function MarkdownPasteInput(props: ArrayOfObjectsInputProps) {
  const { onChange, renderDefault } = props
  const [isOpen, setIsOpen] = useState(false)
  const [markdownPayload, setMarkdownPayload] = useState('')

  const handleApplyConversion = useCallback(() => {
    if (!markdownPayload.trim()) {
      setIsOpen(false)
      return
    }

    const convertedBlocks = parseMarkdownToBlocks(markdownPayload)
    if (convertedBlocks.length > 0) {
      onChange(set(convertedBlocks))
    }

    setMarkdownPayload('')
    setIsOpen(false)
  }, [markdownPayload, onChange])

  return (
    <Stack space={3}>
      <Card padding={2} tone="primary" radius={2} border>
        <Flex justify="space-between" align="center">
          <Box padding={2}>
            <Text weight="semibold" size={1}>
              Markdown Fast Importer
            </Text>
            <Text muted size={1}>
              Paste standard Markdown to automatically map headings (H2–H6), quotes, and lists.
            </Text>
          </Box>
          <Button
            fontSize={1}
            padding={3}
            tone="positive"
            text="⚡ Paste Markdown"
            onClick={() => setIsOpen(true)}
          />
        </Flex>
      </Card>

      {renderDefault(props)}

      {isOpen && (
        <Dialog
          id="markdown-import-dialog"
          header="Import Raw Markdown Content"
          onClose={() => setIsOpen(false)}
          width={2}
          footer={
            <Box padding={3}>
              <Flex justify="flex-end" gap={2}>
                <Button mode="ghost" text="Cancel" onClick={() => setIsOpen(false)} />
                <Button tone="positive" text="Convert & Replace Blocks" onClick={handleApplyConversion} />
              </Flex>
            </Box>
          }
        >
          <Box padding={4}>
            <Stack space={3}>
              <Text size={1} muted>
                Paste your Markdown article body below. Leading `#` tags will convert automatically to `h2` down to `h6`, protecting your single page-level H1.
              </Text>
              <TextArea
                rows={16}
                value={markdownPayload}
                onChange={(event) => setMarkdownPayload(event.currentTarget.value)}
                placeholder="## Section Heading&#10;&#10;Your analytical text here with **bold** and *italic* support..."
                style={{ fontFamily: 'monospace', fontSize: '13px' }}
              />
            </Stack>
          </Box>
        </Dialog>
      )}
    </Stack>
  )
}
import assert from "node:assert/strict";
import { test } from "node:test";
import { XMLParser } from "fast-xml-parser";
import { sanitizeHtml } from "../../content";
import { buildRssXml, legacyHtmlToPlainText } from "../../seo/rss";

test("article sanitization removes executable markup and stays safe after reparsing", () => {
  const inputs = [
    '<p>Research<img src="x" onerror="alert(1)"></p><script>alert(2)</script>',
    '<a href="jav&#x61;script:alert(1)">Research</a>',
    '<svg><a href="javascript:alert(1)"><text>Research</text></a></svg>',
    '<math><mtext><img src="x" onerror="alert(1)"></mtext></math>',
    '<iframe srcdoc="<script>alert(1)</script>"></iframe><p>Research</p>',
    '<template shadowrootmode="open"><img src="x" onerror="alert(1)"></template><p>Research</p>',
  ];
  for (const input of inputs) {
    const clean = sanitizeHtml(input);
    assert.equal(typeof clean, "string");
    assert.doesNotMatch(clean, /<(?:script|iframe|svg|math|template)\b|\bonerror\s*=|javascript:|\bsrcdoc\s*=/i);
    assert.equal(sanitizeHtml(clean), clean, "serialized article remains safe on a second parse");
  }
});

test("sanitization preserves editorial tables, source links and financial math", () => {
  const clean = sanitizeHtml('<p>EUR/USD <strong>research</strong> &amp; $$r_t + x_i$$</p><table><tr><th>Rate</th><td>2.5%</td></tr></table><a href="https://www.ecb.europa.eu/">Source</a>');
  assert.match(clean, /EUR\/USD <strong>research<\/strong> &amp; \$\$r_t \+ x_i\$\$/);
  assert.match(clean, /<table>.*<th>Rate<\/th><td>2\.5%<\/td>.*<\/table>/);
  assert.match(clean, /href="https:\/\/www\.ecb\.europa\.eu\/"/);
});

test("RSS sanitizes legacy HTML and escapes its remaining text as XML", () => {
  const html = '<script>alert(1)</script><p>Rates <strong>2.5%</strong> &amp; reserves &lt; 3.</p><img src="x" onerror="alert(2)">';
  assert.equal(legacyHtmlToPlainText(html), "Rates 2.5% & reserves < 3.");
  const xml = buildRssXml([{
    _id: "sanitization-rss-fixture",
    slug: "rates-research", title: "Rates & reserves", publishedAt: "2026-10-23T00:00:00Z",
    bodyRaw: html, seoDescription: null, excerpt: null, bodyPlainText: null,
    categoryTitle: null, authorName: null,
  }], new Date("2026-10-23T01:00:00Z"));
  const document = new XMLParser().parse(xml);
  assert.equal(document.rss.channel.item.description, "Rates 2.5% & reserves < 3.");
  assert.match(xml, /Rates 2\.5% &amp; reserves &lt; 3\./);
  assert.doesNotMatch(xml, /<script|<img|onerror|alert\(/i);
});

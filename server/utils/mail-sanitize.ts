import DOMPurify from 'isomorphic-dompurify';

export function sanitizeMailHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    USE_PROFILES: { html: true },
  });
}

/**
 * server/utils/mail-sanitize.ts
 *
 * メールHTML本文の安全なサニタイズ処理。
 * isomorphic-dompurify を用いて、XSS等の攻撃を防ぐ。
 */
import DOMPurify from 'isomorphic-dompurify';

/**
 * メールHTML本文を安全にサニタイズするユーティリティ。
 * @param {string} input - サニタイズ対象のHTML文字列
 * @returns {string} サニタイズ済みHTML文字列
 */
export function sanitizeMailHtml(input: string): string {
  return DOMPurify.sanitize(input, {
    USE_PROFILES: { html: true },
  });
}

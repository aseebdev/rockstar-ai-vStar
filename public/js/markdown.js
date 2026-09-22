/**
 * Astra Local AI - Fast, Secure, Zero-Dependency Markdown Parser & Syntax Highlighter
 * Escapes raw HTML to eliminate XSS, formats code blocks, tables, blockquotes, and lists.
 * Robust against streaming partial chunks and unclosed code blocks.
 */

const MarkdownRenderer = (function () {
  /**
   * Escape HTML entities to eliminate XSS vulnerabilities
   */
  function escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Lightweight syntax highlighter for code blocks
   */
  function highlightCode(code, lang) {
    let safe = escapeHtml(code);

    const keywords = [
      'function', 'const', 'let', 'var', 'return', 'import', 'export', 'default',
      'from', 'class', 'extends', 'if', 'else', 'for', 'while', 'switch', 'case',
      'break', 'continue', 'try', 'catch', 'finally', 'throw', 'async', 'await',
      'new', 'this', 'typeof', 'instanceof', 'void', 'delete', 'def', 'print',
      'elif', 'in', 'is', 'lambda', 'with', 'yield', 'None', 'self', 'public',
      'private', 'protected', 'static', 'final', 'interface', 'implements', 'package'
    ];

    const booleans = ['true', 'false', 'null', 'undefined', 'True', 'False'];

    // 1. Comments
    safe = safe.replace(/(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/g, '<span class="hl-comment">$1</span>');

    // 2. Strings
    safe = safe.replace(/(["'`])(.*?)\1/g, '<span class="hl-string">$1$2$1</span>');

    // 3. Numbers
    safe = safe.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="hl-number">$1</span>');

    // 4. Booleans & Null
    const boolRegex = new RegExp(`\\b(${booleans.join('|')})\\b`, 'g');
    safe = safe.replace(boolRegex, '<span class="hl-boolean">$1</span>');

    // 5. Keywords
    const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
    safe = safe.replace(kwRegex, '<span class="hl-keyword">$1</span>');

    return safe;
  }

  /**
   * Main Markdown Parsing Function
   */
  function render(markdown) {
    if (!markdown || typeof markdown !== 'string') return '';

    let textToParse = markdown;

    // If an odd number of ``` backticks exists (meaning stream is mid-code-block), temporarily close it
    const openFences = (textToParse.match(/```/g) || []).length;
    if (openFences % 2 !== 0) {
      textToParse += '\n```';
    }

    const codeBlocks = [];

    // 1. Extract fenced code blocks (```lang ... ```)
    let processed = textToParse.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const id = codeBlocks.length;
      const cleanLang = (lang || 'text').toLowerCase().trim();
      const highlighted = highlightCode(code.trimEnd(), cleanLang);

      const html = `
        <div class="code-block-container">
          <div class="code-block-header">
            <span class="code-lang-tag">${escapeHtml(cleanLang)}</span>
            <button type="button" class="code-copy-btn" data-code="${escapeHtml(code.trimEnd())}" title="Copy code">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span>Copy</span>
            </button>
          </div>
          <pre><code class="language-${escapeHtml(cleanLang)}">${highlighted}</code></pre>
        </div>
      `;
      codeBlocks.push(html);
      return `\n%%CODE_BLOCK_${id}%%\n`;
    });

    // 2. Escape any remaining HTML to prevent XSS
    processed = escapeHtml(processed);

    // 3. Tables (| col | col |)
    processed = processed.replace(/((?:\|[^\n]+\|\r?\n)+)/g, (match) => {
      const rows = match.trim().split('\n');
      if (rows.length < 2) return match;

      let isHeader = true;
      let tableHtml = '<div class="markdown-table-wrapper"><table>';

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i].trim();
        // Check if separator row (| --- | --- |)
        if (/^\|[-:\s|]+\|$/.test(row)) {
          isHeader = false;
          continue;
        }

        const cols = row.split('|').slice(1, -1);
        if (cols.length === 0) continue;

        tableHtml += '<tr>';
        const tag = isHeader ? 'th' : 'td';
        for (const col of cols) {
          tableHtml += `<${tag}>${col.trim()}</${tag}>`;
        }
        tableHtml += '</tr>';
      }

      tableHtml += '</table></div>';
      return tableHtml;
    });

    // 4. Headings
    processed = processed.replace(/^#### (.*$)/gim, '<h4>$1</h4>');
    processed = processed.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    processed = processed.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    processed = processed.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // 5. Blockquotes (> text)
    processed = processed.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

    // 6. Bold, Italic, Strikethrough
    processed = processed.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
    processed = processed.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    processed = processed.replace(/\*(.*?)\*/g, '<em>$1</em>');
    processed = processed.replace(/~~(.*?)~~/g, '<del>$1</del>');

    // 7. Inline Code (`code`)
    processed = processed.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 8. Links ([text](url)) - with safe target="_blank"
    processed = processed.replace(
      /\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
    );

    // 9. Unordered Lists (* or -)
    processed = processed.replace(/^\s*[\-\*]\s+(.*$)/gim, '<li>$1</li>');
    processed = processed.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
    processed = processed.replace(/<\/ul>\s*<ul>/g, '');

    // 10. Ordered Lists (1. 2. 3.)
    processed = processed.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li>$2</li>');
    processed = processed.replace(/(<li>[\s\S]*?<\/li>)/g, '<ol>$1</ol>');
    processed = processed.replace(/<\/ol>\s*<ol>/g, '');

    // 11. Paragraphs (lines separated by double newlines)
    const paragraphs = processed.split(/\n{2,}/);
    processed = paragraphs.map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (/^<(h[1-6]|ul|ol|table|blockquote|div|pre)/i.test(trimmed)) {
        return trimmed;
      }
      if (trimmed.startsWith('%%CODE_BLOCK_')) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    }).join('\n\n');

    // 12. Restore protected code blocks
    for (let i = 0; i < codeBlocks.length; i++) {
      processed = processed.replace(`%%CODE_BLOCK_${i}%%`, codeBlocks[i]);
    }

    return processed;
  }

  return {
    render,
    escapeHtml
  };
})();

// Attach to window
window.MarkdownRenderer = MarkdownRenderer;

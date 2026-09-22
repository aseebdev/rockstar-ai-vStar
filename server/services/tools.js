const crypto = require('crypto');
const AdmZip = require('adm-zip');
const XLSX = require('xlsx');

function envBool(name, fallback = false) {
  const v = process.env[name];
  return v == null ? fallback : ['1','true','yes','on'].includes(String(v).toLowerCase());
}

async function tavilySearch({ query, maxResults = 8, topic = 'general' }) {
  const key = process.env.TAVILY_API_KEY;
  if (!key) throw Object.assign(new Error('Web search is not configured. Add TAVILY_API_KEY to the server environment.'), { statusCode: 503 });
  const response = await fetch(process.env.TAVILY_BASE_URL || 'https://api.tavily.com/search', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ api_key: key, query, search_depth: 'advanced', topic, max_results: Math.min(Math.max(Number(maxResults) || 8, 1), 10), include_answer: true, include_raw_content: false })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.detail || data?.error || `Web search failed (${response.status}).`), { statusCode: response.status });
  return {
    answer: data.answer || '',
    results: (data.results || []).map((r, i) => ({ rank: i + 1, title: r.title, url: r.url, content: r.content, score: r.score, publishedDate: r.published_date || null }))
  };
}

async function openAIImage({ prompt, imageBuffer, imageMime = 'image/png', size = '1024x1024', quality = 'auto', background = 'auto', n = 1 }) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw Object.assign(new Error('Image generation is not configured. Add OPENAI_API_KEY to the server environment.'), { statusCode: 503 });
  const base = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  let response;
  if (imageBuffer) {
    const form = new FormData();
    form.append('model', process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2');
    form.append('prompt', prompt || 'Edit this image.');
    form.append('size', size);
    form.append('quality', quality);
    form.append('background', background);
    form.append('n', String(Math.min(Math.max(Number(n) || 1, 1), 4)));
    form.append('image', new Blob([imageBuffer], { type: imageMime }), 'input.png');
    response = await fetch(`${base}/images/edits`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  } else {
    response = await fetch(`${base}/images/generations`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model: process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2', prompt, size, quality, background, n: Math.min(Math.max(Number(n) || 1, 1), 4) })
    });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.error?.message || `Image provider failed (${response.status}).`), { statusCode: response.status });
  return (data.data || []).map(item => ({ b64: item.b64_json, revisedPrompt: item.revised_prompt || null }));
}

const LANGUAGE_ALIASES = { js: 'javascript', node: 'javascript', nodejs: 'javascript', py: 'python', ts: 'typescript', sh: 'bash', shell: 'bash', cplusplus: 'cpp' };
async function executeCode({ language, version = '*', code, stdin = '' }) {
  const base = (process.env.PISTON_BASE_URL || 'https://emkc.org/api/v2/piston').replace(/\/$/, '');
  if (!envBool('ENABLE_CODE_EXECUTION', false)) throw Object.assign(new Error('Secure code execution is disabled. Configure PISTON_BASE_URL and ENABLE_CODE_EXECUTION=true.'), { statusCode: 503 });
  if (!code || String(code).length > 50000) throw Object.assign(new Error('Code is empty or exceeds the 50,000 character limit.'), { statusCode: 413 });
  const lang = LANGUAGE_ALIASES[String(language || '').toLowerCase()] || String(language || '').toLowerCase();
  if (!lang) throw Object.assign(new Error('A programming language is required.'), { statusCode: 400 });
  const response = await fetch(`${base}/execute`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(process.env.PISTON_API_KEY ? { Authorization: `Bearer ${process.env.PISTON_API_KEY}` } : {}) },
    body: JSON.stringify({ language: lang, version, files: [{ name: lang === 'python' ? 'main.py' : lang === 'javascript' ? 'main.js' : 'main.txt', content: String(code) }], stdin: String(stdin || ''), args: [], run_timeout: 3000, compile_timeout: 10000, max_output_chars: 12000 })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data?.message || data?.error || `Code execution failed (${response.status}).`), { statusCode: response.status });
  return { language: lang, version: data.version || version, compile: data.compile || null, run: data.run || null };
}

function escXml(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}
function paragraphs(text) {
  return String(text || '').split(/\r?\n/).map(line => `<w:p><w:r><w:t xml:space="preserve">${escXml(line || ' ')}</w:t></w:r></w:p>`).join('');
}
function createDocxBuffer({ title = 'Rockstar AI Document', text = '' }) {
  const zip = new AdmZip();
  zip.addFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`));
  zip.addFile('_rels/.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`));
  zip.addFile('word/_rels/document.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`));
  zip.addFile('word/styles.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos"/><w:sz w:val="22"/></w:rPr></w:style></w:styles>`));
  zip.addFile('word/document.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="34"/></w:rPr><w:t>${escXml(title)}</w:t></w:r></w:p>${paragraphs(text)}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`));
  return zip.toBuffer();
}

function createPptxBuffer({ title = 'Rockstar AI Presentation', text = '' }) {
  const zip = new AdmZip();
  const slideText = [title, ...String(text || '').split(/\r?\n/).filter(Boolean)].slice(0, 45);
  const runs = slideText.map((line, i) => `<a:r><a:rPr lang="en-US" sz="${i === 0 ? 2800 : 1800}" b="${i === 0 ? '1' : '0'}"/><a:t>${escXml(line)}</a:t></a:r><a:br/>`).join('');
  const slide = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/><p:sp><p:nvSpPr><p:cNvPr id="2" name="TextBox 1"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="800000" y="700000"/><a:ext cx="10500000" cy="5500000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="0B1020"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/><a:p>${runs}</a:p></p:txBody></p:sp></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
  const presentation = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/><p:defaultTextStyle/></p:presentation>`;
  zip.addFile('[Content_Types].xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/></Types>`));
  zip.addFile('_rels/.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>`));
  zip.addFile('ppt/presentation.xml', Buffer.from(presentation));
  zip.addFile('ppt/_rels/presentation.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/></Relationships>`));
  zip.addFile('ppt/slides/slide1.xml', Buffer.from(slide));
  zip.addFile('ppt/slides/_rels/slide1.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`));
  zip.addFile('ppt/slideMasters/slideMaster1.xml', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/></p:spTree></p:cSld><p:clrMap accent1="4F81BD" accent2="C0504D" accent3="9BBB59" accent4="8064A2" accent5="4BACC6" accent6="F79646" bg1="FFFFFF" bg2="000000" folHlink="800080" hlink="0000FF" tx1="000000" tx2="FFFFFF"/></p:sldMaster>`));
  zip.addFile('ppt/slideMasters/_rels/slideMaster1.xml.rels', Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>`));
  return zip.toBuffer();
}

function createXlsxBuffer({ title = 'Rockstar AI Data', rows = [] }) {
  const data = Array.isArray(rows) && rows.length ? rows : [[title], ['Generated by Rockstar AI']];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Rockstar AI');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function pdfEscape(s) { return String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)').replace(/[^\x20-\x7E]/g, '?'); }
function createPdfBuffer({ title = 'Rockstar AI Document', text = '' }) {
  const lines = [title, '', ...String(text || '').split(/\r?\n/)];
  const pageLines = [];
  let page = [];
  for (const line of lines) { if (page.length >= 48) { pageLines.push(page); page = []; } page.push(String(line).slice(0, 110)); }
  if (page.length) pageLines.push(page);
  const objects = [];
  const pagesKids = [];
  const fontId = 3;
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push('<< /Type /Pages /Kids [KIDS] /Count COUNT >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  for (const p of pageLines) {
    const content = ['BT','/F1 11 Tf','50 790 Td',...p.map((line,i) => `(${pdfEscape(line)}) Tj${i < p.length-1 ? ' 0 -15 Td' : ''}`),'ET'].join('\n');
    const contentId = objects.length + 1; objects.push(`<< /Length ${Buffer.byteLength(content,'ascii')} >>\nstream\n${content}\nendstream`);
    const pageId = objects.length + 1; objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`); pagesKids.push(`${pageId} 0 R`);
  }
  objects[1] = objects[1].replace('KIDS', pagesKids.join(' ')).replace('COUNT', String(pageLines.length));
  let out = '%PDF-1.4\n'; const offsets = [0];
  objects.forEach((obj,i) => { offsets[i+1] = Buffer.byteLength(out,'binary'); out += `${i+1} 0 obj\n${obj}\nendobj\n`; });
  const xref = Buffer.byteLength(out,'binary'); out += `xref\n0 ${objects.length+1}\n0000000000 65535 f \n`; for(let i=1;i<=objects.length;i++) out += `${String(offsets[i]).padStart(10,'0')} 00000 n \n`; out += `trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'binary');
}

function createFile({ type, title, text, rows }) {
  switch (String(type).toLowerCase()) {
    case 'docx': return { buffer: createDocxBuffer({ title, text }), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', ext: 'docx' };
    case 'xlsx': return { buffer: createXlsxBuffer({ title, rows }), mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', ext: 'xlsx' };
    case 'pptx': return { buffer: createPptxBuffer({ title, text }), mime: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', ext: 'pptx' };
    case 'pdf': return { buffer: createPdfBuffer({ title, text }), mime: 'application/pdf', ext: 'pdf' };
    case 'txt': return { buffer: Buffer.from(String(text || ''), 'utf8'), mime: 'text/plain; charset=utf-8', ext: 'txt' };
    case 'md': return { buffer: Buffer.from(String(text || ''), 'utf8'), mime: 'text/markdown; charset=utf-8', ext: 'md' };
    case 'html': return { buffer: Buffer.from(String(text || ''), 'utf8'), mime: 'text/html; charset=utf-8', ext: 'html' };
    case 'json': return { buffer: Buffer.from(JSON.stringify(text, null, 2), 'utf8'), mime: 'application/json', ext: 'json' };
    default: throw Object.assign(new Error(`Unsupported file type: ${type}`), { statusCode: 400 });
  }
}

module.exports = { tavilySearch, openAIImage, executeCode, createFile, createXlsxBuffer, envBool };

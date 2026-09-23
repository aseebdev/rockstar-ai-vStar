const express = require('express');
const router = express.Router();
const astraService = require('../services/astra');
const { validateChatPayload, rateLimit } = require('../middleware/security');
const { requireAuth } = require('../auth');
const { decryptSecret } = require('../key-vault');
const { getPool } = require('../db');
const { reserveUsage, releaseUsage, getUsage } = require('../usage');
const logger = require('../utils/logger');
let pdfParse, mammoth, XLSX, AdmZip;
try { pdfParse = require('pdf-parse'); } catch {}
try { mammoth = require('mammoth'); } catch {}
try { XLSX = require('xlsx'); } catch {}
try { AdmZip = require('adm-zip'); } catch {}

const ROCKSTAR_CREATOR_CONTEXT = `You are Rockstar AI, the AI interface created by Aseebdev (Abdul Aseeb), a Full-Stack MERN Developer focused on Cloud + AI Integration. If a user asks who created Rockstar AI, who Aseebdev is, or asks about the creator, answer accurately: Rockstar AI was created by Aseebdev (Abdul Aseeb). LinkedIn: https://www.linkedin.com/in/aseebdev/. Do not invent additional personal facts.`;
const ROCKSTAR_RUNTIME_CONTEXT = `RUNTIME MODE: ASTRA AI MODEL MODE. This request is being answered through the user's connected Astra AI model, not Rockstar Core and not the offline fallback. If the user asks what mode is active, state clearly that Astra AI model mode is active and name the selected model when known.`;

async function userAstraKey(req) {
  const pool = getPool();
  if (!pool || !req.user?.sub) return '';
  const result = await pool.query('SELECT astra_api_key_encrypted FROM users WHERE id = $1', [req.user.sub]);
  return decryptSecret(result.rows[0]?.astra_api_key_encrypted || '');
}

function limitAstraMessages(messages, maxMessages = 36) {
  const list = Array.isArray(messages) ? messages : [];
  if (list.length <= maxMessages) return list;
  const firstUser = list.find(m => m?.role === 'user');
  const tailCount = maxMessages - (firstUser ? 1 : 0);
  const tail = list.slice(-Math.max(0, tailCount));
  return firstUser && !tail.includes(firstUser) ? [firstUser, ...tail] : tail;
}

router.get('/capabilities', requireAuth, async (req, res, next) => {
  try {
    const hasKey = Boolean(await userAstraKey(req));
    res.json({
      ok: true,
      modes: {
        automatic: true,
        cloud: hasKey,
        offline: true,
        local: false
      },
      tools: {
        fileAnalysis: true,
        documentExport: true,
        webSearch: Boolean(process.env.TAVILY_API_KEY),
        imageGeneration: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
        imageEditing: Boolean(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN),
        codeExecution: process.env.ENABLE_CODE_EXECUTION === 'true',
        voiceBrowser: true,
        voiceTts: Boolean(process.env.OPENAI_API_KEY),
         voiceTranscription: Boolean(process.env.OPENAI_API_KEY),
        webSearch: Boolean(process.env.TAVILY_API_KEY),
        docx: true, xlsx: true, pptx: true,
        secureSharing: true, backgroundJobs: true, auditLogs: true
      },
      notes: {
        webSearch: process.env.TAVILY_API_KEY ? 'Tavily web search connected.' : 'Add TAVILY_API_KEY to connect web search.',
        imageGeneration: (process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN) ? 'Cloudflare Workers AI image generation/editing connected.' : 'Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN to connect image generation/editing.',
        codeExecution: process.env.ENABLE_CODE_EXECUTION === 'true' ? 'Remote sandbox execution enabled through the configured Piston endpoint.' : 'Code execution is disabled until a sandbox endpoint is configured.'
      }
    });
  } catch (err) {
    next(err);
  }
});

router.get('/health', (req, res) => {
  const status = astraService.getStatus();
  res.json({
    ...status,
    brand: 'Rockstar AI',
    appVersion: '4.5.2',
    authenticationRequired: true,
    ownAstraKeyRequired: true,
    dailyMessageLimit: parseInt(process.env.DAILY_MESSAGE_LIMIT, 10) || 20,
    monthlyMessageLimit: parseInt(process.env.MONTHLY_MESSAGE_LIMIT, 10) || 500
  });
});

router.get('/usage', requireAuth, async (req, res, next) => {
  try {
    const usage = await getUsage(req.user.sub);
    res.json(usage || {});
  } catch (err) {
    next(err);
  }
});

router.get('/test-connection', requireAuth, async (req, res, next) => {
  try {
    const apiKey = await userAstraKey(req);
    const result = await astraService.testConnection({ apiKey, model: req.query.model });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/test-connection', requireAuth, async (req, res, next) => {
  try {
    const apiKey = await userAstraKey(req);
    const result = await astraService.testConnection({ apiKey, model: req.body?.model });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/models', requireAuth, async (req, res, next) => {
  try {
    const apiKey = await userAstraKey(req);
    const result = await astraService.getModels({ apiKey });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/attachments/extract', requireAuth, rateLimit({ windowMs: 60 * 1000, max: 12, keyFn: req => req.user?.sub || 'unknown', message: 'Too many file-processing requests. Try hard buddy — it’s built different. — Aseebdev' }), async (req, res) => {
  try {
    const { name, mime, data } = req.body || {};
    if (!name || typeof data !== 'string') {
      return res.status(400).json({ error: { message: 'Attachment name and base64 data are required.' } });
    }
    const raw = data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(raw, 'base64');
    if (buffer.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: { message: 'Attachment is larger than 8 MB.' } });
    }

    const lower = String(name).toLowerCase();
    let text = '';
    let type = mime || '';

    if (lower.endsWith('.pdf') || type === 'application/pdf') {
      if (!pdfParse) return res.status(503).json({ error: { message: 'PDF support is not installed. Run npm install in the project folder.' } });
      const parsed = await pdfParse(buffer);
      text = parsed.text || '';
    } else if (lower.endsWith('.docx') || type.includes('wordprocessingml.document')) {
      if (!mammoth) return res.status(503).json({ error: { message: 'DOCX support is not installed. Run npm install in the project folder.' } });
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || '';
    } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || type.includes('spreadsheet')) {
      if (!XLSX) return res.status(503).json({ error: { message: 'Excel support is not installed. Run npm install in the project folder.' } });
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      text = workbook.SheetNames.map(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        return `Sheet: ${sheetName}\n${XLSX.utils.sheet_to_csv(sheet)}`;
      }).join('\n\n');
    } else if (lower.endsWith('.pptx') || type.includes('presentationml')) {
      if (!AdmZip) return res.status(503).json({ error: { message: 'PowerPoint support is not installed. Run npm install in the project folder.' } });
      const zip = new AdmZip(buffer);
      const entries = zip.getEntries().filter(e => /^ppt\/slides\/slide\d+\.xml$/i.test(e.entryName));
      const chunks = [];
      for (const entry of entries) {
        const xml = entry.getData().toString('utf8');
        const words = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map(m => m[1]);
        if (words.length) chunks.push(words.join(' '));
      }
      text = chunks.join('\n\n');
    } else {
      return res.status(415).json({ error: { message: 'This document format is not supported for text extraction.' } });
    }

    if (!text.trim()) {
      return res.status(422).json({ error: { message: 'The file was opened successfully, but no readable text was found.' } });
    }
    if (text.length > 120000) text = text.slice(0, 120000) + '\n\n[Attachment text truncated at 120,000 characters.]';
    res.json({ ok: true, name, mime: type, text });
  } catch (err) {
    logger.warn(`Attachment extraction failed for ${req.body?.name || 'unknown'}: ${err.message}`);
    res.status(422).json({ error: { message: `Could not read this file: ${err.message}` } });
  }
});

router.post('/chat',
  rateLimit({ windowMs: 60 * 1000, max: 90, message: 'Too many AI requests. Try hard buddy — it’s built different. — Aseebdev' }),
  requireAuth,
  rateLimit({ windowMs: 60 * 1000, max: 30, keyFn: req => req.user?.sub || 'unknown', message: 'Too many AI requests. Try hard buddy — it’s built different. — Aseebdev' }),
  validateChatPayload,
  async (req, res) => {
  const { messages, model, temperature, systemPrompt, stream = true } = req.body;
  // Astra/provider request safety: never forward an unbounded conversation history.
  // The UI also compacts locally, but the server enforces the limit for every client.
  const boundedMessages = limitAstraMessages(messages, parseInt(process.env.ASTRA_MAX_MESSAGES, 10) || 36);
  const apiKey = await userAstraKey(req);

  if (!astraService.isConfigured(apiKey)) {
    return res.status(401).json({
      error: { message: 'Add your own Astra API key in Settings → API & Model. Your key is securely stored for your account and used only for your requests.' }
    });
  }

  let usage;
  try {
    usage = await reserveUsage(req.user.sub);
  } catch (err) {
    return res.status(err.statusCode || 500).json({ error: { message: err.message || 'Could not check usage limits.' } });
  }

  if (!usage.allowed) {
    return res.status(429).json({
      error: {
        message: usage.reason === 'daily'
          ? `Daily limit reached (${usage.daily} AI messages). It resets tomorrow.`
          : `Monthly limit reached (${usage.monthly} AI messages). It resets next month.`
      },
      usage
    });
  }

  const releaseOnce = (() => {
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      try { await releaseUsage(req.user.sub); } catch (e) { logger.warn('Usage refund failed:', e.message); }
    };
  })();

  if (stream) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    res.write(`data: ${JSON.stringify({ usage })}\n\n`);

    const controller = new AbortController();
    let upstreamFinished = false;

    const abortUpstream = () => {
      if (!res.writableEnded && !controller.signal.aborted) {
        logger.info('Client disconnected; aborting upstream stream.');
        controller.abort();
      }
    };
    req.on('aborted', abortUpstream);
    res.on('close', abortUpstream);

    await astraService.streamChatCompletion({
      apiKey,
      boundedMessages,
      model,
      temperature,
      systemPrompt: `${ROCKSTAR_CREATOR_CONTEXT}\n\n${ROCKSTAR_RUNTIME_CONTEXT}\n\n${systemPrompt || ''}`.trim(),
      signal: controller.signal,
      onChunk: (delta) => {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ delta })}\n\n`);
        }
      },
      onDone: ({ fullText, model: responseModel, aborted }) => {
        upstreamFinished = true;
        if (aborted || !fullText) {
          releaseOnce();
        }
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({
            done: true,
            model: responseModel,
            aborted: Boolean(aborted),
            usage
          })}\n\n`);
          res.end();
        }
      },
      onError: async (err) => {
        await releaseOnce();
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ error: err.message, status: err.statusCode || 500 })}\n\n`);
          res.end();
        }
      }
    });

    if (!upstreamFinished && !res.writableEnded) {
      await releaseOnce();
    }
  } else {
    try {
      const controller = new AbortController();
      req.on('aborted', () => controller.abort());
      res.on('close', () => controller.abort());

      let fullText = '';
      let responseModel = model;

      await astraService.streamChatCompletion({
        apiKey,
        boundedMessages,
        model,
        temperature,
        systemPrompt: `${ROCKSTAR_CREATOR_CONTEXT}\n\n${ROCKSTAR_RUNTIME_CONTEXT}\n\n${systemPrompt || ''}`.trim(),
        signal: controller.signal,
        onChunk: (delta) => { fullText += delta; },
        onDone: ({ fullText: text, model: rModel, aborted }) => {
          fullText = text;
          responseModel = rModel;
          if (aborted || !text) releaseOnce();
        },
        onError: (err) => { throw err; }
      });

      res.json({
        role: 'assistant',
        content: fullText,
        model: responseModel,
        usage
      });
    } catch (err) {
      await releaseOnce();
      res.status(err.statusCode || 500).json({
        error: { message: err.message || 'Chat completion failed', status: err.statusCode || 500 }
      });
    }
  }
});

module.exports = router;

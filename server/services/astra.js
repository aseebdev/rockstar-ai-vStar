const logger = require('../utils/logger');

/**
 * ============================================================================
 * ASTRA API SERVICE ADAPTER
 * ============================================================================
 * 
 * Single, isolated integration layer for all Astra API communications.
 * All API authentication, request construction, streaming, response normalization,
 * timeouts, retries, and error translation are contained exclusively within this file.
 * 
 * Configurable via environment variables:
 * - ASTRA_API_KEY: Authentication key / token (required)
 * - ASTRA_BASE_URL: Gateway base URL (default: https://api.astra-api.com/v1)
 * - ASTRA_MODEL: Default model identifier (default: gpt-4o-mini)
 * - ASTRA_SYSTEM_PROMPT: Default system persona
 * - ASTRA_TIMEOUT_MS: Request timeout in milliseconds (default: 30000)
 */

class AstraService {
  constructor() {
    this.reloadConfig();
  }

  /**
   * Reloads configuration from process.env
   */
  reloadConfig() {
        let rawBaseUrl = (process.env.ASTRA_BASE_URL || '').trim();
    this.baseUrl = rawBaseUrl.replace(/\/+$/, '');
    this.model = (process.env.ASTRA_MODEL || '').trim();
    this.systemPrompt = (process.env.ASTRA_SYSTEM_PROMPT || '').trim();
    this.timeoutMs = Math.max(5000, parseInt(process.env.ASTRA_TIMEOUT_MS, 10) || 30000);
    this.chatPath = (process.env.ASTRA_CHAT_PATH || '/chat/completions').trim();
    this.modelsPath = (process.env.ASTRA_MODELS_PATH || '/models').trim();
  }

  /**
   * Returns true if a genuine API key has been supplied (not empty or placeholder)
   */
  isConfigured(apiKey = '') {
    const key = String(apiKey || '').trim();
    return Boolean(key && key.length >= 10);
  }

  /**
   * Safe status object for health checks.
   * STRICT SECURITY GUARANTEE: Never exposes the API key (or even a masked key).
   */
  getStatus() {
    this.reloadConfig();
    return {
      ok: true,
      apiConfigured: false,
      ownKeyRequired: true,
      endpointConfigured: Boolean(this.baseUrl),
      modelConfigured: Boolean(this.model),
      model: this.model,
      baseUrl: this.baseUrl
    };
  }

  /**
   * Build authentication and standard headers for requests to Astra.
   */
  getHeaders(apiKey) {
    const headers = {
      'Authorization': `Bearer ${String(apiKey || '').trim()}`,
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream, application/json'
    };

    // Support optional custom headers (e.g. astra-api-token if required by certain Astra endpoints)
    if (process.env.ASTRA_API_TOKEN) {
      headers['astra-api-token'] = process.env.ASTRA_API_TOKEN.trim();
    }

    if (process.env.ASTRA_CUSTOM_HEADERS) {
      try {
        const custom = JSON.parse(process.env.ASTRA_CUSTOM_HEADERS);
        Object.assign(headers, custom);
      } catch (e) {
        logger.warn('Could not parse ASTRA_CUSTOM_HEADERS JSON:', e.message);
      }
    }

    return headers;
  }

  /**
   * Translates HTTP and network error codes into safe, human-readable explanations.
   */
  formatApiError(status, errorBody) {
    let detail = '';
    if (errorBody && typeof errorBody === 'object') {
      detail = errorBody.error?.message || errorBody.message || errorBody.description || JSON.stringify(errorBody);
    } else if (typeof errorBody === 'string') {
      detail = errorBody;
    }

    switch (status) {
      case 400:
        return `Astra API Bad Request (400): ${detail || 'The request payload or model parameters were invalid.'}`;
      case 401:
        return `Astra API Authentication Failed (401): The API key is missing, invalid, or expired. Check the key you entered.`;
      case 403:
        return `Astra API Forbidden (403): Your account does not have access permissions for model "${this.model}". Detail: ${detail || 'Forbidden'}`;
      case 404:
        return `Astra API Endpoint Not Found (404): Check your ASTRA_BASE_URL ("${this.baseUrl}") or model name. Detail: ${detail || 'Not Found'}`;
      case 408:
        return `Astra API Request Timeout (408): The upstream server took too long to respond.`;
      case 409:
        return `Astra API Conflict (409): State conflict on upstream server. Detail: ${detail || 'Conflict'}`;
      case 429:
        if (detail && /model_requires_purchase|model_requires_payment|free_limit_reached|insufficient_quota/i.test(detail)) {
          return `Astra model access/quota error (429): ${detail}`;
        }
        return `Astra API Rate Limit Exceeded (429): Too many requests. Please wait a moment and try again.`;
      case 500:
      case 502:
      case 503:
      case 504:
        return `Astra API Service Unavailable (${status}): Upstream AI provider is temporarily unavailable. Detail: ${detail || 'Service Error'}`;
      default:
        return `Astra API request failed with status ${status}: ${detail || 'Unknown error'}`;
    }
  }

  /**
   * Executes a fetch with automatic timeout and single-retry on transient errors.
   */
  async fetchWithRetry(url, options, retries = 1) {
    let lastError = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      const timeoutController = new AbortController();
      const timeoutId = setTimeout(() => timeoutController.abort(), this.timeoutMs);

      // Merge signals if caller provided one
      let signal = timeoutController.signal;
      if (options.signal) {
        if (options.signal.aborted) {
          clearTimeout(timeoutId);
          const err = new Error('Request aborted');
          err.name = 'AbortError';
          throw err;
        }
        options.signal.addEventListener('abort', () => timeoutController.abort());
      }

      try {
        const response = await fetch(url, { ...options, signal });
        clearTimeout(timeoutId);

        // Retry only genuinely transient responses. Astra documents insufficient_quota
        // and model_requires_* 429s as non-transient, so those must never be retried.
        let retryable = response.status === 502 || response.status === 503 || response.status === 504;
        if (response.status === 429) {
          try {
            const body = await response.clone().json();
            const message = body?.error?.message || body?.message || '';
            const code = body?.error?.code || body?.code || '';
            const nonTransient = /insufficient_quota|model_requires_purchase|model_requires_payment|free_limit_reached/i.test(`${code} ${message}`);
            retryable = !nonTransient;
          } catch {
            // If the body is not JSON, treat a 429 as retryable.
            retryable = true;
          }
        }
        if (attempt < retries && retryable) {
          logger.warn(`Transient HTTP ${response.status} from Astra. Retrying in 1.5s (attempt ${attempt + 1}/${retries})...`);
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }

        return response;
      } catch (err) {
        clearTimeout(timeoutId);
        lastError = err;

        if (err.name === 'AbortError' && options.signal?.aborted) {
          // User cancellation; do not retry
          throw err;
        }

        if (attempt < retries) {
          logger.warn(`Network error contacting Astra: ${err.message}. Retrying in 1.5s...`);
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  formatNetworkError(err) {
    const code = err?.cause?.code || err?.code;
    if (code === 'ENOTFOUND') {
      return `Could not resolve Astra API host. Check ASTRA_BASE_URL: ${this.baseUrl || '(not configured)'}`;
    }
    if (code === 'ECONNREFUSED') {
      return `Astra API connection was refused. Check ASTRA_BASE_URL: ${this.baseUrl}`;
    }
    if (code === 'ETIMEDOUT' || err?.name === 'TimeoutError') {
      return `Astra API request timed out after ${this.timeoutMs}ms.`;
    }
    return `Network error connecting to Astra API: ${err?.message || 'Unknown network error'}`;
  }

  /**
   * Real Astra API Connection Test.
   * Contacts the configured Astra API endpoint and measures true roundtrip latency.
   */
  async testConnection({ apiKey, model } = {}) {
    this.reloadConfig();

    if (!this.isConfigured(apiKey)) {
      return {
        ok: false,
        status: 401,
        latencyMs: 0,
        message: 'Your Astra API key is missing. Add your own key in Settings → API & Model.'
      };
    }

    const startTime = Date.now();
    try {
      // 1. First probe: Probe GET /models
      const headers = this.getHeaders(apiKey);
      let response;
      try {
        response = await this.fetchWithRetry(`${this.baseUrl}${this.modelsPath.startsWith('/') ? this.modelsPath : `/${this.modelsPath}`}`, {
          method: 'GET',
          headers
        }, 0);
      } catch (probeErr) {
        // If /models failed at network level, catch below
        throw probeErr;
      }

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        const json = await response.json().catch(() => ({}));
        const count = Array.isArray(json.data) ? json.data.length : null;
        const countInfo = count !== null ? ` (${count} models available)` : '';
        return {
          ok: true,
          status: response.status,
          latencyMs,
          message: `Connected successfully to Astra API at ${this.baseUrl}! Roundtrip: ${latencyMs}ms${countInfo}`
        };
      }

      // 2. If /models is 404 or 405 (endpoint not provided), probe minimal chat completion
      if (response.status === 404 || response.status === 405) {
        const chatStart = Date.now();
        const chatTestRes = await this.fetchWithRetry(`${this.baseUrl}${this.chatPath.startsWith('/') ? this.chatPath : `/${this.chatPath}`}`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: model || this.model,
            messages: [{ role: 'user', content: 'ping' }],
            max_tokens: 1
          })
        }, 0);

        const chatLatency = Date.now() - chatStart;
        if (chatTestRes.ok) {
          return {
            ok: true,
            status: chatTestRes.status,
            latencyMs: chatLatency,
            message: `Connected successfully to Astra chat completions (${chatLatency}ms, model: ${model || this.model})`
          };
        }

        const errJson = await chatTestRes.json().catch(() => null);
        return {
          ok: false,
          status: chatTestRes.status,
          latencyMs: chatLatency,
          message: this.formatApiError(chatTestRes.status, errJson)
        };
      }

      const errJson = await response.json().catch(() => null);
      return {
        ok: false,
        status: response.status,
        latencyMs,
        message: this.formatApiError(response.status, errJson)
      };
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      if (err.name === 'AbortError') {
        return {
          ok: false,
          status: 408,
          latencyMs,
          message: `Connection timed out after ${this.timeoutMs}ms while reaching Astra at ${this.baseUrl}.`
        };
      }
      return {
        ok: false,
        status: 503,
        latencyMs,
        message: this.formatNetworkError(err)
      };
    }
  }

  /**
   * Retrieves available models.
   * If Astra does not support model discovery (returns 404 or fails),
   * returns supported: false with the current configured model rather than inventing fake models.
   */
  async getModels({ apiKey } = {}) {
    this.reloadConfig();

    if (!this.isConfigured(apiKey)) {
      return {
        supported: false,
        currentModel: this.model,
        models: this.model ? [{ id: this.model, name: this.model }] : [],
        error: 'Astra API key is not configured.'
      };
    }

    try {
      const headers = this.getHeaders(apiKey);
      const response = await this.fetchWithRetry(`${this.baseUrl}${this.modelsPath.startsWith('/') ? this.modelsPath : `/${this.modelsPath}`}`, {
        method: 'GET',
        headers
      }, 0);

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        return {
          supported: false,
          currentModel: this.model,
          models: this.model ? [{ id: this.model, name: this.model }] : [],
          error: this.formatApiError(response.status, body)
        };
      }

      const json = await response.json().catch(() => ({}));
      let discovered = Array.isArray(json.data)
        ? json.data.filter(m => typeof m.id === 'string').map(m => ({
            id: m.id,
            name: m.id,
            description: m.owned_by ? `Provider: ${m.owned_by}` : 'Astra model'
          }))
        : [];

      return {
        supported: true,
        currentModel: this.model,
        models: discovered,
        filtered: false
      };
    } catch (err) {
      const message = this.formatNetworkError(err);
      logger.warn('Astra models discovery unavailable:', message);
      return {
        supported: false,
        currentModel: this.model,
        models: this.model ? [{ id: this.model, name: this.model }] : [],
        error: message
      };
    }
  }

  /**
   * Unified Chat Completion method.
   * Supports:
   * - Streaming (SSE): reads text/event-stream chunks
   * - Non-streaming fallback: reads JSON if upstream doesn't stream
   * - Cancellation: hooks into signal to abort immediately
   * - Error normalization: extracts clear error messages
   */
  async streamChatCompletion({ apiKey, messages, model, temperature, systemPrompt, signal, onChunk, onDone, onError }) {
    this.reloadConfig();

    if (!this.isConfigured(apiKey)) {
      const err = new Error('Your Astra API key is missing. Add your own key in Settings → API & Model.');
      err.statusCode = 401;
      onError(err);
      return;
    }
    if (!this.baseUrl) {
      const err = new Error('ASTRA_BASE_URL is not configured. Set the official Astra API base URL in .env.');
      err.statusCode = 500;
      onError(err);
      return;
    }
    const selectedModel = model || this.model;
    if (!selectedModel) {
      const err = new Error('ASTRA_MODEL is not configured and no model was selected.');
      err.statusCode = 400;
      onError(err);
      return;
    }
    const effectiveSystem = typeof systemPrompt === 'string' && systemPrompt.trim().length > 0
      ? systemPrompt.trim()
      : this.systemPrompt;

    // Assemble messages payload
    const finalMessages = [];
    const hasSystem = messages.some(m => m.role === 'system');
    if (!hasSystem && effectiveSystem) {
      finalMessages.push({ role: 'system', content: effectiveSystem });
    }
    finalMessages.push(...messages);

    const payload = {
      model: selectedModel,
      messages: finalMessages,
      stream: true
    };
    // Only send temperature when explicitly supplied by the client. This keeps
    // the default request compatible with providers/models that do not support it.
    if (typeof temperature === 'number') payload.temperature = temperature;

    logger.info(`Sending chat request to Astra: model="${selectedModel}", messagesCount=${finalMessages.length}`);

    let response;
    try {
      response = await this.fetchWithRetry(`${this.baseUrl}${this.chatPath.startsWith('/') ? this.chatPath : `/${this.chatPath}`}`, {
        method: 'POST',
        headers: this.getHeaders(apiKey),
        body: JSON.stringify(payload),
        signal
      }, 1);
    } catch (err) {
      if (err.name === 'AbortError' || signal?.aborted) {
        logger.info('Chat completion cancelled by client.');
        onDone({ fullText: '', model: selectedModel, aborted: true });
        return;
      }
      logger.error('Fetch error during Astra chat completion:', err.message);
      onError(new Error(`Failed to communicate with Astra API: ${err.message}`));
      return;
    }

    if (!response.ok) {
      let errBody;
      try {
        errBody = await response.json();
      } catch {
        errBody = await response.text().catch(() => '');
      }
      const errorMsg = this.formatApiError(response.status, errBody);
      logger.error(`Astra chat completion failed: HTTP ${response.status}`);
      const err = new Error(errorMsg);
      err.statusCode = response.status;
      onError(err);
      return;
    }

    const contentType = response.headers.get('content-type') || '';

    // CASE 1: Upstream returned normal JSON (non-streaming response from Astra)
    if (!contentType.includes('text/event-stream')) {
      try {
        const json = await response.json();
        const content = json.choices?.[0]?.message?.content || json.output_text || '';
        const respModel = json.model || selectedModel;
        if (content) {
          onChunk(content);
        }
        onDone({ fullText: content, model: respModel, aborted: false });
        return;
      } catch (jsonErr) {
        onError(new Error(`Failed to parse non-streaming Astra JSON response: ${jsonErr.message}`));
        return;
      }
    }

    // CASE 2: Upstream returned standard SSE Stream
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
    let responseModel = selectedModel;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;

          if (trimmed.startsWith('data:')) {
            const dataStr = trimmed.slice(5).trim();

            if (dataStr === '[DONE]') {
              onDone({ fullText, model: responseModel, aborted: false });
              return;
            }

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.model) responseModel = parsed.model;

              const choice = parsed.choices?.[0];
              if (choice) {
                const deltaContent = choice.delta?.content || choice.delta?.text || parsed.delta || (parsed.type === 'response.output_text.delta' ? parsed.delta : '') || '';
                if (deltaContent) {
                  fullText += deltaContent;
                  onChunk(deltaContent);
                }
              }
            } catch (e) {
              // Ignore partial JSON lines
            }
          }
        }
      }

      // Flush remaining line if any
      if (buffer.trim()) {
        const trimmed = buffer.trim();
        if (trimmed.startsWith('data:')) {
          const dataStr = trimmed.slice(5).trim();
          if (dataStr !== '[DONE]') {
            try {
              const parsed = JSON.parse(dataStr);
              const deltaContent = parsed.choices?.[0]?.delta?.content || '';
              if (deltaContent) {
                fullText += deltaContent;
                onChunk(deltaContent);
              }
            } catch {}
          }
        }
      }

      onDone({ fullText, model: responseModel, aborted: false });
    } catch (streamErr) {
      if (streamErr.name === 'AbortError' || signal?.aborted) {
        logger.info('Chat stream cancelled by client.');
        onDone({ fullText, model: responseModel, aborted: true });
        return;
      }
      logger.error('Error while reading Astra SSE stream:', streamErr.message);
      onError(new Error(`Stream reading error: ${streamErr.message}`));
    }
  }
}

const astraService = new AstraService();
module.exports = astraService;

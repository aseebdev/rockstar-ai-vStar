/**
 * Astra Local AI - Client API Connector
 * Secure communication layer interfacing exclusively with local Node.js server routes.
 * Zero API keys or secrets are ever accessed, accepted, or transmitted by this file.
 */

const AstraClient = (function () {
  /**
   * Fetch backend health and Astra configuration status
   * Response: { ok: true, apiConfigured: boolean, model: string, baseUrl: string }
   */
  async function getHealth() {
    const res = await fetch('/api/health', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error(`Health check failed with HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Fetch list of available models from Astra API (or fallback configuration if endpoint unsupported)
   * Response: { supported: boolean, currentModel: string, models: Array }
   */
  async function getModels() {
    const res = await fetch('/api/models', { credentials: 'include', cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to load models with HTTP ${res.status}`);
    return await res.json();
  }

  /**
   * Perform real Astra connection test via server.
   * Server tests its configured .env credentials against Astra API.
   * Response: { ok: boolean, status: number, latencyMs: number, message: string }
   */
  async function testConnection() {
    const res = await fetch('/api/test-connection', { credentials: 'include' });
    return await res.json();
  }

  /**
   * Stream a chat completion from local backend via Server-Sent Events (SSE).
   * Returns an object with an `abort()` method to cancel generation at any time.
   */
  function streamChat({ messages, model, temperature, systemPrompt, onChunk, onDone, onError }) {
    const controller = new AbortController();
    let aborted = false;

    (async () => {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify({
            messages,
            model,
            temperature,
            systemPrompt,
            stream: true
          }),
          signal: controller.signal
        });

        if (!response.ok) {
          const errJson = await response.json().catch(() => null);
          const msg = errJson?.error?.message || `Server error: HTTP ${response.status}`;
          const err = new Error(msg);
          err.status = response.status;
          err.code = errJson?.error?.code || '';
          onError(err);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let buffer = '';
        let fullText = '';
        let responseModel = model;

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
              try {
                const parsed = JSON.parse(dataStr);

                if (parsed.error) {
                  onError(new Error(parsed.error));
                  return;
                }

                if (parsed.delta) {
                  fullText += parsed.delta;
                  onChunk(parsed.delta);
                }

                if (parsed.done) {
                  onDone({
                    fullText,
                    model: parsed.model || responseModel,
                    aborted: Boolean(parsed.aborted || aborted)
                  });
                  return;
                }
              } catch (e) {
                // Ignore partial JSON lines
              }
            }
          }
        }

        // Stream completed without explicit done signal
        onDone({
          fullText,
          model: responseModel,
          aborted
        });
      } catch (err) {
        if (err.name === 'AbortError' || aborted) {
          onDone({ fullText: '', model, aborted: true });
        } else {
          onError(err);
        }
      }
    })();

    return {
      abort: () => {
        aborted = true;
        controller.abort();
      }
    };
  }

  return {
    getHealth,
    getModels,
    testConnection,
    streamChat
  };
})();

// Attach to window
window.AstraClient = AstraClient;

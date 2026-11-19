import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in environment secrets.');
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  app.post('/api/scan-receipt', async (req, res) => {
    try {
      const { imageDataUrl } = req.body as { imageDataUrl?: string };
      if (!imageDataUrl || typeof imageDataUrl !== 'string') {
        res.status(400).json({ error: 'Missing imageDataUrl payload.' });
        return;
      }

      const match = imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
      if (!match) {
        res.status(400).json({ error: 'Invalid base64 image data URL.' });
        return;
      }

      const mimeType = match[1];
      const base64Data = match[2];

      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: {
          parts: [
            {
              inlineData: {
                mimeType,
                data: base64Data,
              },
            },
            {
              text: [
                'Extract payment details from this Malaysian bank transfer, DuitNow QR, FPX, or cash receipt slip.',
                'Return accurate values:',
                '- amount: numeric value in Malaysian Ringgit (RM), e.g. 250 or 125.50 (0 if unreadable).',
                '- transactionDate: ISO date YYYY-MM-DD (empty string if unreadable).',
                '- billingMonth: YYYY-MM derived from the transaction date or stated rental month (empty string if unreadable).',
                '- paymentMethod: strictly one of "DuitNow QR", "Online Transfer", or "Cash". Use "DuitNow QR" if DuitNow QR is shown, "Online Transfer" for Maybank/CIMB/Bank Islam/RHB/FPX/IBG/DuitNow Transfer, or "Cash" for cash slips.',
                '- bankRefNo: bank reference number, transaction ID, or receipt reference (empty string if none).',
                '- payerName: name of the sender / payer account holder if visible (empty string if not visible).',
              ].join('\n'),
            },
          ],
        },
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              amount: {
                type: Type.NUMBER,
                description: 'Total payment amount in RM',
              },
              transactionDate: {
                type: Type.STRING,
                description: 'Transaction date formatted YYYY-MM-DD',
              },
              billingMonth: {
                type: Type.STRING,
                description: 'Billing month formatted YYYY-MM',
              },
              paymentMethod: {
                type: Type.STRING,
                description: 'One of: DuitNow QR, Online Transfer, Cash',
              },
              bankRefNo: {
                type: Type.STRING,
                description: 'Bank or DuitNow reference number',
              },
              payerName: {
                type: Type.STRING,
                description: 'Sender or payer name visible on receipt',
              },
            },
            required: [
              'amount',
              'transactionDate',
              'billingMonth',
              'paymentMethod',
              'bankRefNo',
              'payerName',
            ],
          },
        },
      });

      const rawText = (response.text ?? '{}').trim();
      const parsed = JSON.parse(rawText) as {
        amount?: number;
        transactionDate?: string;
        billingMonth?: string;
        paymentMethod?: string;
        bankRefNo?: string;
        payerName?: string;
      };

      const normalizedMethod =
        parsed.paymentMethod === 'DuitNow QR' ||
        parsed.paymentMethod === 'Online Transfer' ||
        parsed.paymentMethod === 'Cash'
          ? parsed.paymentMethod
          : 'Online Transfer';

      const txDate = /^\d{4}-\d{2}-\d{2}$/.test(parsed.transactionDate || '')
        ? parsed.transactionDate!
        : '';
      const billMonth = /^\d{4}-\d{2}$/.test(parsed.billingMonth || '')
        ? parsed.billingMonth!
        : txDate
          ? txDate.slice(0, 7)
          : '';

      res.json({
        amount: typeof parsed.amount === 'number' && !Number.isNaN(parsed.amount) ? parsed.amount : 0,
        transactionDate: txDate,
        billingMonth: billMonth,
        paymentMethod: normalizedMethod,
        bankRefNo: (parsed.bankRefNo || '').trim(),
        payerName: (parsed.payerName || '').trim(),
      });
    } catch (error) {
      console.error('Receipt scan error:', error);
      const message =
        error instanceof Error ? error.message : 'Failed to scan payment proof.';
      res.status(500).json({ error: message });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GIS Nilai Hostel Portal server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();

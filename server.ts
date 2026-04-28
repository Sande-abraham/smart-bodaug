import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Handle API routes BEFORE anything else
  app.use(express.json());

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // Proxy route for Gemini AI
  app.post('/api/gemini', async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    try {
      const { contents, config, model = 'gemini-3-flash-preview' } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey) {
        console.error(`[${requestId}] GEMINI_API_KEY is missing in backend env`);
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
      }

      const ai = new GoogleGenAI({ apiKey });
      
      const response = await ai.models.generateContent({
        model: model,
        contents: Array.isArray(contents) ? contents : contents,
        config: config
      });

      res.json({ text: response.text });
    } catch (error: any) {
      console.error('Gemini Proxy Error:', error);
      res.status(500).json({ error: error.message || 'AI Service Error' });
    }
  });

  // Vite integration (Development) / Static Serving (Production)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

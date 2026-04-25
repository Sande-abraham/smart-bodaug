import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API Route for Gemini
  app.post('/api/gemini', async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[${requestId}] Gemini Proxy Request received`);
    
    try {
      const { prompt, config, systemInstruction } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey || apiKey.length < 5) {
        console.error(`[${requestId}] Server: GEMINI_API_KEY missing or invalid`);
        return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server. Please set it in the Settings menu or Secrets.' });
      }

      console.log(`[${requestId}] Server: Initializing GenAI with key prefix: ${apiKey.substring(0, 4)}...`);
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-1.5-flash',
        systemInstruction: systemInstruction 
      });

      console.log(`[${requestId}] Server: Calling Gemini 1.5 Flash...`);
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: config
      });

      const response = await result.response;
      const text = response.text();
      console.log(`[${requestId}] Server: Gemini success, response length: ${text.length}`);
      res.json({ text });
    } catch (error: any) {
      console.error(`[${requestId}] Gemini Proxy Error:`, error);
      // Return a structured error so the client can handle it
      res.status(500).json({ 
        error: error.message || 'Internal Server Error',
        details: error.stack,
        code: error.status || 500
      });
    }
  });

  // Vite integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
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

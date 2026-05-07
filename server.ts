import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenerativeAI } from "@google/generative-ai";
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Handle API routes BEFORE anything else
  app.use(express.json());

  // Log all requests for debugging
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
  });

  // Health check
  app.get(['/api/health', '/health'], (req, res) => {
    res.json({ 
      status: 'ok', 
      time: new Date().toISOString(),
      env: process.env.NODE_ENV,
      hasApiKey: !!process.env.GEMINI_API_KEY
    });
  });

  app.post(['/api/gemini', '/api/gemini/'], async (req, res) => {
    const requestId = Math.random().toString(36).substring(7);
    console.log(`[${requestId}] Gemini req received: ${req.url}`);
    try {
      const { contents, config, model = 'gemini-1.5-flash' } = req.body;
      const apiKey = process.env.GEMINI_API_KEY;

      if (!apiKey || apiKey === "MY_GEMINI_API_KEY" || apiKey.length < 5) {
        console.error(`[${requestId}] GEMINI_API_KEY is missing or invalid`);
        return res.status(500).json({ error: 'Gemini API Key missing or invalid' });
      }

      console.log(`[${requestId}] Calling Gemini with model: ${model}`);
      
      const genAI = new GoogleGenerativeAI(apiKey.trim());
      const modelInstance = genAI.getGenerativeModel({ model: model });
      
      const formattedContents = Array.isArray(contents) ? contents : [{ role: 'user', parts: [{ text: contents }] }];

      const result = await modelInstance.generateContent({
        contents: formattedContents,
        generationConfig: config
      });

      const response = await result.response;
      const text = response.text();

      if (!text) {
        return res.json({ text: "{}" });
      }

      console.log(`[${requestId}] Gemini success, text length: ${text.length}`);
      res.json({ text });
    } catch (error: any) {
      console.error(`[${requestId}] Gemini Proxy Total Failure:`, error);
      res.status(500).json({ 
        error: error.message || 'AI Service Error'
      });
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

  // Final catch-all for 404s on API
  app.use('/api/*', (req, res) => {
    console.log(`[404] API Route not found: ${req.method} ${req.originalUrl}`);
    res.status(404).json({ error: `API Route not found: ${req.method} ${req.originalUrl}` });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();

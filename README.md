# BodaSmart Optimizer 🏍️🇺🇬

Fuel optimization and profit maximization system for boda-boda riders in Kampala.

## Quick Start Guide

### 1. Prerequisites
Make sure you have **Node.js** installed (v18 or higher). You can download it from [nodejs.org](https://nodejs.org/).

### 2. Installation
Open your terminal in this folder and run:
```bash
npm install
```

### 3. Run the Application
Start the development server:
```bash
npm run dev
```

### 4. View the App
Open **Microsoft Edge** and go to:
[http://localhost:3000](http://localhost:3000)

---

## Features
- **AI Route Optimization**: Uses Gemini AI to find the most fuel-efficient paths.
- **Profit Calculator**: Calculates net profit after fuel costs.
- **Real-time Dashboard**: Track your daily earnings and fuel usage.
- **Smart Insights**: AI-driven suggestions to avoid traffic and save money.

## Tech Stack
- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Firebase (Cloud Firestore & Auth)
- **AI**: Google Gemini API

## Deployment Guide

This app can be hosted on platforms like **Netlify**, **Vercel**, or **GitHub Pages**.

### 1. Build the App
Before deploying, you MUST create a production build. This converts the TypeScript code into optimized JavaScript that browsers can understand.
```bash
npm run build
```

### 2. Deployment Settings
When prompted by your hosting provider, use these settings:
- **Build Command**: `npm run build`
- **Publish/Output Directory**: `dist`

### 3. Environment Variables
You must set your **GEMINI_API_KEY** in the hosting platform's dashboard (Environment Variables section) for the AI features to work.

### 4. Hosting Notes
- **Netlify**: Use the included `netlify.toml`.
- **Vercel**: Use the included `vercel.json`.
- **Backend Service**: Note that the Gemini AI features use a proxy in `server.ts` which requires a Node.js runtime. If you use static hosting (like GitHub Pages), the AI features will need to be migrated to a serverless function.

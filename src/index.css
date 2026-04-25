@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
@import "leaflet/dist/leaflet.css";
@import "tailwindcss";

@theme {
  --color-brand-yellow: #FFD700;
  --color-brand-blue: #004ADD;
  --color-bg-main: #F4F7FB;
  --color-brand-black: #101214;
  
  --color-traffic-green: #10B981;
  --color-traffic-amber: #F59E0B;
  --color-traffic-red: #EF4444;
  
  --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
}

@layer base {
  body {
    @apply bg-bg-main text-brand-black antialiased font-sans;
  }
}

@layer components {
  /* Clean Utility Styles */
  .card-premium {
    @apply bg-white rounded-[24px] shadow-[0_4px_20px_rgba(0,0,0,0.04)] border border-gray-100 p-4 transition-all duration-300;
  }
  
  .input-modern {
    @apply w-full bg-gray-50 border-2 border-transparent rounded-xl p-3 focus:bg-white focus:border-brand-yellow outline-none transition-all text-base font-bold placeholder:text-gray-400;
  }

  .btn-primary {
    @apply bg-brand-yellow text-black font-black uppercase tracking-widest text-[9px] py-3 px-6 rounded-xl shadow-xl shadow-brand-yellow/10 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2;
  }

  .btn-outline {
    @apply border-2 border-gray-200 text-gray-700 font-bold py-3 px-4 rounded-xl hover:bg-gray-50 transition-all flex items-center justify-center gap-2;
  }

  /* Map custom styles for a cleaner look */
  .leaflet-container {
    border-radius: 1.5rem !important; /* 24px - matching 3xl */
  }

  .leaflet-popup-content-wrapper {
    border-radius: 1rem !important; /* 16px - matching 2xl */
    border: none !important;
    box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25) !important;
  }

  .suggestion-item {
    @apply w-full px-5 py-4 text-left hover:bg-gray-50 transition-colors flex items-center justify-between border-b last:border-0;
  }
}

.profit-badge {
    @apply bg-green-50 text-traffic-green px-4 py-2 rounded-xl font-bold border border-green-100;
}

@keyframes dash {
  to {
    stroke-dashoffset: -40;
  }
}

.route-animated {
  animation: dash 1s linear infinite;
  filter: drop-shadow(0 0 4px rgba(0,0,0,0.2));
}

.route-glow {
  filter: drop-shadow(0 0 6px currentcolor);
}

import { Router } from 'express';

export const aiRouter = Router();

// Memory store for user token balances (defaulting to 10 tokens per user session)
const userTokens = new Map<string, number>();

export function getUserTokens(userId: string = 'anonymous-session'): number {
  const cleanId = userId || 'anonymous-session';
  if (!userTokens.has(cleanId)) {
    userTokens.set(cleanId, 10); // 10 free trial tokens
  }
  return userTokens.get(cleanId)!;
}

export function setUserTokens(userId: string = 'anonymous-session', amount: number) {
  const cleanId = userId || 'anonymous-session';
  userTokens.set(cleanId, Math.max(0, amount));
}

// ── Token Balance & Subscription API Routes ──
aiRouter.get('/tokens/balance', (req: any, res: any) => {
  const userId = req.query.userId || 'anonymous-session';
  const balance = getUserTokens(userId);
  return res.json({ balance });
});

aiRouter.post('/tokens/grant', (req: any, res: any) => {
  const { userId, amount } = req.body;
  const current = getUserTokens(userId || 'anonymous-session');
  const target = current + (amount !== undefined ? Number(amount) : 10);
  setUserTokens(userId || 'anonymous-session', target);
  return res.json({ balance: target });
});

aiRouter.post('/tokens/reset', (req: any, res: any) => {
  const { userId } = req.body;
  setUserTokens(userId || 'anonymous-session', 10);
  return res.json({ balance: 10 });
});


// Optimize user prompts for printable, production-ready isolated sublimation assets
function optimizePromptForSublimation(userPrompt: string, mode: string): string {
  const cleanPrompt = userPrompt.trim();
  
  // Strict negative instructions to prevent mannequin, model, 3D presentation renders, studio hangers, and clothing mockups
  const assetNegativeRules = "isolated flat design asset, 2D vector style, no mannequin, no t-shirt mockup, no model, no clothing presentation render, no hanger, no photorealistic studio background, no human figures, ready for print-sewing, crisp sharp lines, high contrast";

  switch (mode) {
    case 'pattern':
      return `Seamless tileable repeating pattern for dye-sublimation sportswear fabric: ${cleanPrompt}. Sports apparel mesh fill, infinite repeat, clean geometric grid, high-contrast vector panel fill, ${assetNegativeRules}`;
    case 'texture':
      return `High-resolution seamless print texture for sports apparel: ${cleanPrompt}. Carbon fiber weave, tech mesh structure, cyberpunk energy grid, sublimation-safe texture panel, ${assetNegativeRules}`;
    case 'overlay':
      return `Isolated vector shape accent overlay graphic for jersey layout: ${cleanPrompt}. Aggressive esports flame accents, aerodynamic wings, technical sports decals, vector overlay elements, isolated on flat background, ${assetNegativeRules}`;
    case 'typography':
      return `Sharp standalone modern athletic technical typography lettering: ${cleanPrompt}. Championship sports jersey numbers, bold esports typography layout, isolated on flat solid background, ${assetNegativeRules}`;
    case 'logo':
      return `Standalone vector crest shield badge design: ${cleanPrompt}. Clean technical sports team brand emblem, sharp esports vector logo asset, high-detail printable patch, ${assetNegativeRules}`;
    default:
      return `${cleanPrompt}. Isolated design graphic asset, flat vector art, sports sublimation ready, ${assetNegativeRules}`;
  }
}

// Dynamic local SVG generator for Sandbox Simulator Mode (perfectly matching the asset modes)
function generateSandboxSvg(prompt: string, mode: string, colors: string[]): string {
  const primaryColor = colors[0] || '#ff0055';
  const secondaryColor = colors[1] || '#00ffcc';
  const accentColor = colors[2] || '#ffcc00';
  const backgroundColor = '#111216';

  const cleanPrompt = prompt.toLowerCase();

  // 1. Pattern Mode
  if (mode === 'pattern' || cleanPrompt.includes('pattern') || cleanPrompt.includes('grid')) {
    return `svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
      <rect width="400" height="400" fill="${backgroundColor}"/>
      <defs>
        <pattern id="dotGrid" width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="2" fill="${primaryColor}" opacity="0.6"/>
          <path d="M 0 10 L 20 10 M 10 0 L 10 20" stroke="${secondaryColor}" stroke-width="0.5" opacity="0.15" />
        </pattern>
      </defs>
      <rect width="400" height="400" fill="url(#dotGrid)"/>
      <path d="M 0 0 L 400 400 M 400 0 L 0 400" stroke="${accentColor}" stroke-width="1.5" stroke-dasharray="10 10" opacity="0.4"/>
    </svg>`;
  }

  // 2. Texture Mode
  if (mode === 'texture' || cleanPrompt.includes('texture') || cleanPrompt.includes('mesh')) {
    return `svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
      <rect width="500" height="500" fill="${backgroundColor}"/>
      <defs>
        <pattern id="carbonMesh" width="10" height="10" patternUnits="userSpaceOnUse">
          <path d="M0 0 L10 10 M10 0 L0 10" stroke="${primaryColor}" stroke-width="1.2" opacity="0.4"/>
          <rect width="5" height="5" fill="${secondaryColor}" opacity="0.3"/>
        </pattern>
        <radialGradient id="glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${accentColor}" stop-opacity="0.35"/>
          <stop offset="100%" stop-color="${backgroundColor}" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <circle cx="250" cy="250" r="230" fill="url(#glow)"/>
      <rect width="500" height="500" fill="url(#carbonMesh)"/>
    </svg>`;
  }

  // 3. Overlay Mode (Flames/Wings Accents)
  if (mode === 'overlay' || cleanPrompt.includes('flame') || cleanPrompt.includes('wing') || cleanPrompt.includes('accent')) {
    return `svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
      <defs>
        <linearGradient id="overlayGrad" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="${primaryColor}"/>
          <stop offset="50%" stop-color="${accentColor}"/>
          <stop offset="100%" stop-color="${secondaryColor}"/>
        </linearGradient>
      </defs>
      <!-- Aerodynamic Esports Flame Accent Group -->
      <g transform="translate(250, 250)">
        <path d="M-150,0 C-50,-180 50,-180 150,0 C80,30 20,40 -20,20 C-60,50 -100,60 -150,0 Z" fill="url(#overlayGrad)"/>
        <path d="M-120,-30 C-30,-140 30,-140 120,-30 C60,0 20,10 -10,0 C-40,20 -80,30 -120,-30 Z" fill="#ffffff" opacity="0.2"/>
        <circle cx="0" cy="-60" r="15" fill="${accentColor}" opacity="0.8"/>
      </g>
    </svg>`;
  }

  // 4. Typography Mode
  if (mode === 'typography' || cleanPrompt.includes('text') || cleanPrompt.includes('number')) {
    return `svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
      <defs>
        <linearGradient id="typoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${primaryColor}"/>
          <stop offset="100%" stop-color="${secondaryColor}"/>
        </linearGradient>
      </defs>
      <!-- Standalone technical jersey number '99' and name placeholder -->
      <g transform="translate(250, 250)">
        <text x="0" y="40" font-family="'Impact', 'monospace', sans-serif" font-weight="900" font-size="190" fill="url(#typoGrad)" stroke="${accentColor}" stroke-width="4" text-anchor="middle" letter-spacing="10">99</text>
        <text x="0" y="-120" font-family="'Outfit', 'Inter', sans-serif" font-weight="900" font-size="34" fill="#ffffff" text-anchor="middle" letter-spacing="15">CHAMPION</text>
        <line x1="-150" y1="-80" x2="150" y2="-80" stroke="${accentColor}" stroke-width="4" />
      </g>
    </svg>`;
  }

  // 5. Logo Mode
  if (mode === 'logo' || cleanPrompt.includes('logo') || cleanPrompt.includes('badge')) {
    return `svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
      <defs>
        <linearGradient id="logoGrad" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stop-color="${accentColor}"/>
          <stop offset="100%" stop-color="${primaryColor}"/>
        </linearGradient>
      </defs>
      <!-- Sports Shield Crest Badge -->
      <g transform="translate(250, 250)">
        <path d="M -120 -150 L 120 -150 Q 120 20 0 160 Q -120 20 -120 -150 Z" fill="url(#logoGrad)" stroke="${secondaryColor}" stroke-width="6"/>
        <path d="M -100 -130 L 100 -130 Q 100 10 0 135 Q -100 10 -100 -130 Z" fill="#0d0d15" opacity="0.8"/>
        <!-- Star graphic -->
        <polygon points="0,-70 20,-20 70,-20 30,10 50,60 0,30 -50,60 -30,10 -70,-20 -20,-20" fill="${secondaryColor}"/>
      </g>
    </svg>`;
  }

  // Default Synthwave Sunset/Synth element
  return `svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
    <defs>
      <linearGradient id="sunGrad" x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${accentColor}"/>
        <stop offset="50%" stop-color="${primaryColor}"/>
        <stop offset="100%" stop-color="${secondaryColor}"/>
      </linearGradient>
    </defs>
    <circle cx="250" cy="250" r="180" fill="url(#sunGrad)"/>
    <path d="M 0 350 L 500 350" stroke="${secondaryColor}" stroke-width="4" opacity="0.4" />
  </svg>`;
}

// 1. POST /api/ai/enhance
aiRouter.post('/enhance', async (req: any, res: any) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const openRouterKey = process.env.OPENROUTER_API_KEY;

    if (!openRouterKey) {
      // Sandbox Mode prompt enhancement
      console.log(`[DesignSync AI Gateway] Enhance running in SANDBOX SIMULATOR mode.`);
      const enhanced = `High-end hyper-detailed esports sublimation jersey pattern, themed around "${prompt}". Sharp aggressive vector panels, intense cyber gradients, sleek technical lines, futuristic championship detailing, 8k resolution vector asset.`;
      return res.json({ enhancedPrompt: enhanced });
    }

    // Call OpenRouter API
    console.log(`[DesignSync AI Gateway] Enhancing prompt via OpenRouter...`);
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openRouterKey}`,
        'HTTP-Referer': 'https://designsync.studio',
        'X-Title': 'DesignSync Studio',
      },
      body: JSON.stringify({
        model: 'google/gemini-flash-1.5',
        messages: [
          {
            role: 'system',
            content: 'You are an elite designer expert in dye-sublimation esports jerseys, patterns, and textiles. Expand the user prompt into a hyper-detailed, highly effective prompt for AI image generators (like Stable Diffusion, Flux, or Recraft). Describe dynamic vector overlays, sports themes, color combinations, and aggressive clean shapes. Keep the response to a single expanded prompt of under 80 words.'
          },
          {
            role: 'user',
            content: `Enhance this prompt: "${prompt}"`
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.statusText}`);
    }

    const data = await response.json();
    const enhancedPrompt = data.choices?.[0]?.message?.content?.trim() || prompt;
    return res.json({ enhancedPrompt });
  } catch (error: any) {
    console.error('❌ Error enhancing prompt:', error);
    // Graceful fallback to sandbox response if API fails
    const enhanced = `Premium dye-sublimation sports pattern: "${prompt}", featuring ultra-sharp vector details, clean technical graphics, and professional jersey aesthetics.`;
    return res.json({ enhancedPrompt: enhanced, note: 'Fallback prompt enhancement applied.' });
  }
});

// 2. POST /api/ai/generate
aiRouter.post('/generate', async (req: any, res: any) => {
  try {
    const { prompt, providerMode, baseColors, userId } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const cleanUserId = userId || 'anonymous-session';
    const currentBalance = getUserTokens(cleanUserId);

    if (currentBalance <= 0) {
      return res.status(403).json({
        error: 'OUT_OF_TOKENS',
        message: 'You have exhausted your free generation credits. Please subscribe to a premium plan to continue generating.'
      });
    }

    const mode = providerMode || 'vector';
    const colors = baseColors || ['#ff0055', '#00ffcc', '#ffcc00'];

    // Inject strict dye-sub sublimation prompt parameters (Asset-Based generation)
    const optimizedPrompt = optimizePromptForSublimation(prompt, mode);

    // Scan for credentials to determine if we run Sandbox or live API calls
    const hasRecraft = !!process.env.RECRAFT_API_KEY;
    const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
    const hasStability = !!process.env.STABILITY_API_KEY;

    // Check if we should fall back to Sandbox Simulator Mode
    let isSandbox = true;
    if (mode === 'recraft' && hasRecraft) isSandbox = false;
    else if ((mode === 'flux' || mode === 'pattern' || mode === 'texture' || mode === 'overlay' || mode === 'typography' || mode === 'logo') && hasReplicate) isSandbox = false;
    else if (mode === 'vector' && (hasRecraft || hasReplicate)) isSandbox = false;

    if (isSandbox) {
      console.log(`[DesignSync AI Gateway] Generating in SANDBOX SIMULATOR mode. Mode: ${mode}`);
      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, 800));

      const svgData = generateSandboxSvg(prompt, mode, colors);
      const dataUri = `data:${svgData}`;

      setUserTokens(cleanUserId, currentBalance - 1);

      return res.json({
        url: dataUri,
        type: 'vector',
        isSandbox: true,
        colors: colors,
        prompt: prompt,
        message: 'Successfully generated high-fidelity sublimation asset in Sandbox Mode!',
        remainingTokens: currentBalance - 1
      });
    }

    // --- REAL API LOGIC ---
    // Recraft AI Vector API integration
    if (mode === 'recraft' && hasRecraft) {
      console.log(`[DesignSync AI Gateway] Routing to Recraft AI...`);
      const response = await fetch('https://external.api.recraft.ai/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RECRAFT_API_KEY}`,
        },
        body: JSON.stringify({
          prompt: optimizedPrompt,
          style: 'vector_illustration',
          substyle: 'linocut',
          colors: colors.map((c: string) => ({ hex: c })),
        })
      });

      if (!response.ok) throw new Error(`Recraft API error: ${response.statusText}`);
      const data = await response.json();
      setUserTokens(cleanUserId, currentBalance - 1);
      return res.json({
        url: data.data?.[0]?.url,
        type: 'vector',
        isSandbox: false,
        remainingTokens: currentBalance - 1
      });
    }

    // Replicate Flux Integration
    if (hasReplicate) {
      console.log(`[DesignSync AI Gateway] Routing to Replicate (Flux Schnell)...`);
      const response = await fetch('https://api.replicate.com/v1/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
        },
        body: JSON.stringify({
          version: 'black-forest-labs/flux-schnell',
          input: {
            prompt: optimizedPrompt,
            go_fast: true,
            megapixels: '1',
            num_outputs: 1,
            aspect_ratio: '1:1',
            output_format: 'webp',
          }
        })
      });

      if (!response.ok) throw new Error(`Replicate API error: ${response.statusText}`);
      const data = await response.json();

      // Poll Replicate prediction endpoint
      let prediction = data;
      let attempts = 0;
      while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 10) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const check = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
          headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
        });
        prediction = await check.json();
        attempts++;
      }

      if (prediction.status === 'succeeded') {
        setUserTokens(cleanUserId, currentBalance - 1);
        return res.json({
          url: prediction.output?.[0],
          type: 'raster',
          isSandbox: false,
          remainingTokens: currentBalance - 1
        });
      } else {
        throw new Error('Replicate generation failed or timed out.');
      }
    }

    throw new Error('Unsupported mode or unconfigured provider');
  } catch (error: any) {
    console.error('❌ Generation Gateway Error:', error);
    // Fail-safe fall back to Sandbox rather than throwing an error to client
    const svgData = generateSandboxSvg(req.body.prompt || 'esports', req.body.providerMode || 'vector', req.body.baseColors || []);
    return res.json({
      url: `data:${svgData}`,
      type: 'vector',
      isSandbox: true,
      errorOccurred: true,
      message: `Gateway API failed: ${error.message}. Loaded in Sandbox Simulator fallback mode.`
    });
  }
});

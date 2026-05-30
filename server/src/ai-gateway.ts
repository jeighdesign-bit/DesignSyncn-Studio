import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

export const aiRouter = Router();

// ─── Supabase admin client (service role) ────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''
);

// Memory store for user token balances (defaulting to 999999 tokens per user session)
const userTokens = new Map<string, number>();

export function getUserTokens(userId: string = 'anonymous-session'): number {
  const cleanId = userId || 'anonymous-session';
  if (!userTokens.has(cleanId)) {
    userTokens.set(cleanId, 999999); // 999999 free trial tokens
  }
  return userTokens.get(cleanId)!;
}

export function setUserTokens(userId: string = 'anonymous-session', amount: number) {
  const cleanId = userId || 'anonymous-session';
  const current = userTokens.get(cleanId) ?? 10;
  userTokens.set(cleanId, Math.max(0, amount));
  
  // If we are deducting a token (amount decreased), also sync and deduct in Supabase DB
  if (amount < current) {
    deductUserTokenDatabase(cleanId);
  }
}

// Helper to deduct tokens from Supabase DB
async function deductUserTokenDatabase(userId: string) {
  try {
    const { data: tokenRecord } = await supabaseAdmin
      .from('token_usage')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (tokenRecord) {
      const remaining = Math.max(0, (tokenRecord.tokens_remaining ?? 10) - 1);
      const used = (tokenRecord.tokens_used ?? 0) + 1;
      
      await supabaseAdmin
        .from('token_usage')
        .update({
          tokens_remaining: remaining,
          tokens_used: used,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);
    }
  } catch (err) {
    console.error('[ai-gateway] Failed to deduct token from Supabase:', err);
  }
}

// ── Token Balance & Subscription API Routes ──
aiRouter.get('/tokens/balance', async (req: any, res: any) => {
  const userId = req.query.userId || 'anonymous-session';
  
  try {
    const { data } = await supabaseAdmin
      .from('token_usage')
      .select('tokens_remaining')
      .eq('user_id', userId)
      .single();
      
    if (data) {
      setUserTokens(userId, data.tokens_remaining);
      return res.json({ balance: data.tokens_remaining });
    }
  } catch (err) {
    console.warn('[ai-gateway] Failed to query Supabase tokens, using memory fallback');
  }

  const balance = getUserTokens(userId);
  return res.json({ balance });
});

aiRouter.post('/tokens/grant', async (req: any, res: any) => {
  const { userId, amount } = req.body;
  const cleanId = userId || 'anonymous-session';
  const grantAmount = amount !== undefined ? Number(amount) : 10;
  
  let current = getUserTokens(cleanId);
  try {
    const { data } = await supabaseAdmin
      .from('token_usage')
      .select('tokens_remaining')
      .eq('user_id', cleanId)
      .single();
    if (data) {
      current = data.tokens_remaining;
    }
  } catch {}

  const target = current + grantAmount;
  setUserTokens(cleanId, target);

  try {
    await supabaseAdmin
      .from('token_usage')
      .upsert({
        user_id: cleanId,
        tokens_remaining: target,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
  } catch (e) {
    console.error('[ai-gateway] Failed to update grant in Supabase:', e);
  }

  return res.json({ balance: target });
});

aiRouter.post('/tokens/reset', async (req: any, res: any) => {
  const { userId } = req.body;
  const cleanId = userId || 'anonymous-session';
  setUserTokens(cleanId, 10);

  try {
    await supabaseAdmin
      .from('token_usage')
      .upsert({
        user_id: cleanId,
        tokens_remaining: 10,
        tokens_used: 0,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' });
  } catch (e) {
    console.error('[ai-gateway] Failed to reset in Supabase:', e);
  }

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
    return `svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
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
    return `svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
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
    return `svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
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
    return `svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
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
    return `svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
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
  return `svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="500" height="500">
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

    const data = (await response.json()) as any;
    const enhancedPrompt = data.choices?.[0]?.message?.content?.trim() || prompt;
    return res.json({ enhancedPrompt });
  } catch (error: any) {
    console.error('❌ Error enhancing prompt:', error);
    // Graceful fallback to sandbox response if API fails
    const enhanced = `Premium dye-sublimation sports pattern: "${req.body.prompt || ''}", featuring ultra-sharp vector details, clean technical graphics, and professional jersey aesthetics.`;
    return res.json({ enhancedPrompt: enhanced, note: 'Fallback prompt enhancement applied.' });
  }
});

// 2. POST /api/ai/generate
aiRouter.post('/generate', async (req: any, res: any) => {
  try {
    const { prompt, providerMode, baseColors, userId, referenceImage } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const cleanUserId = userId || 'anonymous-session';
    
    // Sync token balance from Supabase database if available
    let currentBalance = getUserTokens(cleanUserId);
    try {
      const { data: dbRecord } = await supabaseAdmin
        .from('token_usage')
        .select('tokens_remaining')
        .eq('user_id', cleanUserId)
        .single();
      if (dbRecord) {
        currentBalance = dbRecord.tokens_remaining;
        userTokens.set(cleanUserId, currentBalance);
      }
    } catch (e) {
      console.warn('[ai-gateway] Failed to query Supabase tokens, using memory store');
    }

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

    // Multimodal pattern extraction for reference images via Gemini Vision
    // We analyze the PATTERN specifically (not the jersey silhouette) for accurate vector generation
    let patternDescription = '';
    let isMockup = false;
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (referenceImage && (geminiApiKey || openRouterKey)) {
      try {
        console.log(`[DesignSync AI Gateway] Extracting pattern description from reference image via Gemini Vision...`);
        const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, "");
        const analysisPromptText = `You are an expert sportswear sublimation designer analyzing a reference image to extract its design for replication.

Analyze this image carefully and respond in EXACTLY this format with no extra text:
[IS_MOCKUP]: <true if this is a photo of a garment (jersey, t-shirt, hoodie, mannequin, flat-lay), false if it is a flat digital graphic>
[PATTERN_DESCRIPTION]: <Describe ONLY the surface design/artwork — the colors, shapes, lines, and patterns visible on the fabric. Be precise: e.g. "bold vertical white stripes of varying widths on a jet-black base, with a subtle tone-on-tone dark Japanese wave pattern underneath. High contrast. Athletic, classic sportswear aesthetic." Ignore: shirt silhouette, neckline, hanger, logos, numbers, and background. Max 70 words.>
[COLORS]: <List 3-5 exact hex color codes from the design, e.g. #000000, #FFFFFF, #CC0000>`;

        let analysisResponse: Response | null = null;

        // Try native Gemini API first (free, direct)
        if (geminiApiKey) {
          console.log(`[DesignSync AI Gateway] Using native Gemini API for pattern analysis...`);
          analysisResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    { text: analysisPromptText },
                    { inlineData: { mimeType: 'image/jpeg', data: base64Data } }
                  ]
                }]
              })
            }
          );

          if (analysisResponse.ok) {
            const data = (await analysisResponse.json()) as any;
            patternDescription = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
          } else {
            console.warn(`[DesignSync AI Gateway] Native Gemini API failed (${analysisResponse.status}), trying OpenRouter...`);
            analysisResponse = null;
          }
        }

        // Fallback to OpenRouter if native Gemini failed or not configured
        if (!patternDescription && openRouterKey) {
          console.log(`[DesignSync AI Gateway] Using OpenRouter for pattern analysis...`);
          const orResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openRouterKey}`,
              'HTTP-Referer': 'https://designsync.studio',
              'X-Title': 'DesignSync Studio',
            },
            body: JSON.stringify({
              model: 'google/gemini-flash-1.5',
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: analysisPromptText },
                  { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${base64Data}` } }
                ]
              }]
            })
          });
          if (orResponse.ok) {
            const data = (await orResponse.json()) as any;
            patternDescription = data.choices?.[0]?.message?.content?.trim() || '';
          }
        }

        if (patternDescription) {
          console.log(`[DesignSync AI Gateway] Pattern analysis raw output:\n${patternDescription}`);
          
          const mockupMatch = patternDescription.match(/\[IS_MOCKUP\]:\s*(true|false)/i);
          const descMatch = patternDescription.match(/\[PATTERN_DESCRIPTION\]:\s*([\s\S]*?)(?:\[COLORS\]:|$)/i);
          
          if (mockupMatch) {
            isMockup = mockupMatch[1].toLowerCase() === 'true';
          } else {
            // Fallback mockup detection logic
            isMockup = patternDescription.toLowerCase().includes('mockup') || 
                       patternDescription.toLowerCase().includes('jersey') || 
                       patternDescription.toLowerCase().includes('t-shirt') ||
                       patternDescription.toLowerCase().includes('garment') ||
                       patternDescription.toLowerCase().includes('clothing');
          }
          
          let parsedDesc = '';
          if (descMatch) {
            parsedDesc = descMatch[1].trim();
          } else {
            // Fallback: strip tags and keep clean description
            parsedDesc = patternDescription
              .replace(/\[IS_MOCKUP\]:\s*(true|false)/gi, '')
              .replace(/\[PATTERN_DESCRIPTION\]:/gi, '')
              .replace(/\[COLORS\]:[\s\S]*/gi, '')
              .trim();
          }
          
          if (parsedDesc) {
            patternDescription = parsedDesc;
          }
          
          console.log(`[DesignSync AI Gateway] Parsed isMockup: ${isMockup}, Parsed Pattern Description: "${patternDescription}"`);
        }
      } catch (err) {
        console.error('[DesignSync AI Gateway] Failed to analyze reference image:', err);
      }
    }

    // Build the final prompt: if we extracted a pattern, use that; otherwise use the user prompt
    let finalPrompt = optimizedPrompt;
    if (patternDescription) {
      if (isMockup) {
        finalPrompt = `Premium sportswear sublimation placement artwork, full front panel, isolated on pure white background. Design: ${patternDescription}. Style rules: sharp clean vector paths, full bleed from edge to edge, bold layout with strong visual hierarchy from top to bottom. STRICT: NO shirt outline, NO neckline shape, NO collar boundary, NO repeating tiles, NO text, NO logos, NO human figures. Pure artwork only.`;
      } else {
        finalPrompt = `Flat vector seamless sportswear sublimation pattern: ${patternDescription}. Isolated graphic tile on white background, crisp clean vector edges, print-ready, no clothing silhouette, no background elements.`;
      }
    }

    // Scan for credentials to determine if we run Sandbox or live API calls
    const hasRecraft = !!process.env.RECRAFT_API_KEY;
    const hasReplicate = !!process.env.REPLICATE_API_TOKEN;
    const hasStability = !!process.env.STABILITY_API_KEY;

    // Check if we should fall back to Sandbox Simulator Mode
    let isSandbox = true;
    if ((mode === 'recraft' || mode === 'vector') && (hasRecraft || hasReplicate)) isSandbox = false;
    else if ((mode === 'flux' || mode === 'pattern' || mode === 'texture' || mode === 'overlay' || mode === 'typography' || mode === 'logo') && hasReplicate) isSandbox = false;

    if (isSandbox) {
      console.log(`[DesignSync AI Gateway] Generating in SANDBOX SIMULATOR mode. Mode: ${mode}`);
      // Simulate network latency
      await new Promise((resolve) => setTimeout(resolve, 800));

      const svgData = generateSandboxSvg(prompt, mode, colors);
      const rawSvg = svgData.replace('svg+xml;utf8,', '');
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(rawSvg).toString('base64')}`;

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
    // Recraft AI Vector API integration (Official OpenAPI Spec)
    if ((mode === 'recraft' || mode === 'vector') && hasRecraft) {
      console.log(`[DesignSync AI Gateway] Routing to Recraft AI...`);

      // Clean up prompt to remove garment words that confuse the AI into drawing mockups/shirts
      let cleanedPrompt = finalPrompt;
      const confusingWords = [
        /\bjersey(s)?\b/gi,
        /\bt-?shirt(s)?\b/gi,
        /\bshirt(s)?\b/gi,
        /\bclothing\b/gi,
        /\bgarment(s)?\b/gi,
        /\bpanel(s)?\b/gi,
        /\bcollar(s)?\b/gi,
        /\bsleeve(s)?\b/gi,
        /\bmock-?up(s)?\b/gi,
        /\bmannequin(s)?\b/gi,
      ];
      for (const rx of confusingWords) {
        cleanedPrompt = cleanedPrompt.replace(rx, '');
      }
      // Ensure we don't end up with double spaces/commas
      cleanedPrompt = cleanedPrompt.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim();

      // Determine Recraft style
      const recraftStyle = 'vector_illustration';

      console.log(`[DesignSync AI Gateway] Recraft Mode: ${recraftStyle}, Cleaned Prompt: "${cleanedPrompt}"`);

      // IF referenceImage is present and is NOT a mockup jersey photo: use our premium color-mapped Image-to-Image vector replication
      if (referenceImage && !isMockup) {
        const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, 'base64');
        const blob = new Blob([buffer], { type: 'image/png' });

        console.log(`[DesignSync AI Gateway] Replicating reference style via Image-to-Image (I2I) at strength 0.45...`);
        try {
          const imgFormData = new FormData();
          imgFormData.append('image', blob, 'reference.png');
          imgFormData.append('prompt', finalPrompt);
          imgFormData.append('style', 'vector_illustration');
          imgFormData.append('strength', '0.45');
          
          // Apply custom hex colors dynamically to the reference image conversion
          if (colors && colors.length > 0) {
            imgFormData.append('colors', JSON.stringify(colors.map((c: string) => ({ hex: c }))));
          }

          const imgResponse = await fetch('https://external.api.recraft.ai/v1/images/imageToImage', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.RECRAFT_API_KEY}`,
            },
            body: imgFormData,
          });

          if (imgResponse.ok) {
            const imgData = (await imgResponse.json()) as any;
            const vectorUrl = imgData.data?.[0]?.url;
            if (vectorUrl) {
              console.log(`[DesignSync AI Gateway] I2I SUCCESS. Vector Pattern: ${vectorUrl}`);
              setUserTokens(cleanUserId, currentBalance - 1);
              return res.json({
                url: vectorUrl,
                type: 'vector',
                isSandbox: false,
                remainingTokens: currentBalance - 1,
                pipeline: 'recraft-image-to-image-pattern'
              });
            }
          } else {
            const errorText = await imgResponse.text();
            console.error(`[DesignSync AI Gateway] Image-to-Image API error: "${errorText}" (Status: ${imgResponse.status})`);
          }
        } catch (err: any) {
          console.error(`[DesignSync AI Gateway] Image-to-Image exception: ${err.message}`);
        }
      }

      // Otherwise, standard generation
      const response = await fetch('https://external.api.recraft.ai/v1/images/generations/vector', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.RECRAFT_API_KEY}`,
        },
        body: JSON.stringify({
          prompt: cleanedPrompt,
          model: 'recraftv4_vector',
          style: recraftStyle,
          colors: colors.map((c: string) => ({ hex: c })),
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        const errorBody = (() => { try { return JSON.parse(errorText); } catch { return {}; } })();

        // If Recraft is out of credits, immediately fall through to Replicate instead of crashing
        if (response.status === 400 && errorBody?.code === 'not_enough_credits') {
          console.warn(`[DesignSync AI Gateway] Recraft credits exhausted — falling through to Replicate Flux 1.1 Pro...`);
          // Fall through to Replicate section below by skipping the throw
        } else {
          console.error(`[DesignSync AI Gateway] Recraft API error response: "${errorText}" (Status: ${response.status})`);
          throw new Error(`Recraft API error (${response.status}): ${errorText || response.statusText}`);
        }
      } else {
        const data = (await response.json()) as any;
        setUserTokens(cleanUserId, currentBalance - 1);
        return res.json({
          url: data.data?.[0]?.url,
          type: 'vector',
          isSandbox: false,
          remainingTokens: currentBalance - 1
        });
      }
    }

    // Replicate Flux 1.1 Pro Integration (high-quality fallback)
    if (hasReplicate) {
      console.log(`[DesignSync AI Gateway] Routing to Replicate (Flux 1.1 Pro)...`);
      const response = await fetch('https://api.replicate.com/v1/models/black-forest-labs/flux-1.1-pro/predictions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
          'Prefer': 'wait',
        },
        body: JSON.stringify({
          input: {
            prompt: finalPrompt,
            width: 1024,
            height: 1024,
            num_outputs: 1,
            aspect_ratio: '1:1',
            output_format: 'png',
            output_quality: 100,
            safety_tolerance: 2,
            prompt_upsampling: false,
          }
        })
      });

      if (!response.ok) throw new Error(`Replicate API error: ${response.statusText}`);
      const data = (await response.json()) as any;

      // Replicate returns the result immediately when using 'Prefer: wait'
      // If it's already succeeded, return right away
      if (data.status === 'succeeded' && data.output) {
        const outputUrl = Array.isArray(data.output) ? data.output[0] : data.output;
        setUserTokens(cleanUserId, currentBalance - 1);
        return res.json({
          url: outputUrl,
          type: 'raster',
          isSandbox: false,
          pipeline: 'replicate-flux-1.1-pro',
          remainingTokens: currentBalance - 1
        });
      }

      // Poll Replicate prediction endpoint if not immediately done
      let prediction: any = data;
      let attempts = 0;
      while (prediction.status !== 'succeeded' && prediction.status !== 'failed' && attempts < 20) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const check = await fetch(`https://api.replicate.com/v1/predictions/${prediction.id}`, {
          headers: { 'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}` }
        });
        prediction = (await check.json()) as any;
        attempts++;
      }

      if (prediction.status === 'succeeded') {
        const outputUrl = Array.isArray(prediction.output) ? prediction.output[0] : prediction.output;
        setUserTokens(cleanUserId, currentBalance - 1);
        return res.json({
          url: outputUrl,
          type: 'raster',
          isSandbox: false,
          pipeline: 'replicate-flux-1.1-pro',
          remainingTokens: currentBalance - 1
        });
      } else {
        throw new Error(`Replicate generation failed or timed out. Status: ${prediction.status}`);
      }
    }

    throw new Error('Unsupported mode or unconfigured provider');
  } catch (error: any) {
    console.error('❌ Generation Gateway Error:', error);
    
    // If credentials are configured, we want to know if it failed instead of silently falling back to sandbox!
    if (process.env.RECRAFT_API_KEY || process.env.REPLICATE_API_TOKEN) {
      return res.status(500).json({
        error: 'GENERATION_FAILED',
        message: `AI Generation failed: ${error.message}`
      });
    }

    const svgData = generateSandboxSvg(req.body.prompt || 'esports', req.body.providerMode || 'vector', req.body.baseColors || []);
    const rawSvg = svgData.replace('svg+xml;utf8,', '');
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(rawSvg).toString('base64')}`;
    return res.json({
      url: dataUri,
      type: 'vector',
      isSandbox: true,
      errorOccurred: true,
      message: `Gateway API failed: ${error.message}. Loaded in Sandbox Simulator fallback mode.`
    });
  }
});

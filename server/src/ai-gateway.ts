import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import FormData from 'form-data';
dotenv.config();

export const aiRouter = Router();

// ─── Supabase admin client (service role) ────────────────────────────────────
const supabaseAdmin = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || ''
);

// ─── Token Memory Store ───────────────────────────────────────────────────────
const userTokens = new Map<string, number>();

export function getUserTokens(userId: string = 'anonymous-session'): number {
  const cleanId = userId || 'anonymous-session';
  if (!userTokens.has(cleanId)) {
    userTokens.set(cleanId, 999999);
  }
  return userTokens.get(cleanId)!;
}

export function setUserTokens(userId: string = 'anonymous-session', amount: number) {
  const cleanId = userId || 'anonymous-session';
  const current = userTokens.get(cleanId) ?? 10;
  userTokens.set(cleanId, Math.max(0, amount));
  if (amount < current) {
    deductUserTokenDatabase(cleanId);
  }
}

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
        .update({ tokens_remaining: remaining, tokens_used: used, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    }
  } catch (err) {
    console.error('[ai-gateway] Failed to deduct token from Supabase:', err);
  }
}

// ─── Token API Routes ─────────────────────────────────────────────────────────
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
  return res.json({ balance: getUserTokens(userId) });
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
    if (data) current = data.tokens_remaining;
  } catch {}
  const target = current + grantAmount;
  setUserTokens(cleanId, target);
  try {
    await supabaseAdmin.from('token_usage').upsert({
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
    await supabaseAdmin.from('token_usage').upsert({
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

// ─── Sandbox SVG fallback (when no API key or offline) ───────────────────────
function generateSandboxSvg(colors: string[]): string {
  const primary = colors[0] || '#ff0055';
  const secondary = colors[1] || '#00ffcc';
  const accent = colors[2] || '#ffcc00';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">
    <rect width="800" height="500" fill="#ffffff"/>
    <defs>
      <linearGradient id="g1" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${primary}"/>
        <stop offset="100%" stop-color="${secondary}"/>
      </linearGradient>
      <linearGradient id="g2" x1="100%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stop-color="${secondary}"/>
        <stop offset="100%" stop-color="${accent}"/>
      </linearGradient>
    </defs>
    <!-- Front Panel -->
    <rect x="30" y="30" width="350" height="440" rx="8" fill="url(#g1)" opacity="0.95"/>
    <path d="M 30 120 L 380 80 L 380 200 L 30 240 Z" fill="${accent}" opacity="0.35"/>
    <path d="M 30 240 L 380 200 L 380 320 L 30 360 Z" fill="#ffffff" opacity="0.15"/>
    <path d="M 80 30 L 80 470" stroke="${accent}" stroke-width="3" opacity="0.5"/>
    <path d="M 330 30 L 330 470" stroke="${accent}" stroke-width="3" opacity="0.5"/>
    <text x="205" y="280" font-family="Impact,sans-serif" font-size="60" fill="${accent}" text-anchor="middle" opacity="0.8">23</text>
    <text x="205" y="460" font-family="Arial,sans-serif" font-size="11" fill="rgba(0,0,0,0.4)" text-anchor="middle">FRONT PANEL</text>
    <!-- Back Panel -->
    <rect x="420" y="30" width="350" height="440" rx="8" fill="url(#g2)" opacity="0.95"/>
    <path d="M 420 100 L 770 140 L 770 260 L 420 220 Z" fill="${primary}" opacity="0.35"/>
    <path d="M 420 280 L 770 240 L 770 380 L 420 420 Z" fill="#ffffff" opacity="0.15"/>
    <path d="M 470 30 L 470 470" stroke="${accent}" stroke-width="3" opacity="0.5"/>
    <path d="M 720 30 L 720 470" stroke="${accent}" stroke-width="3" opacity="0.5"/>
    <text x="595" y="200" font-family="Arial,sans-serif" font-size="13" fill="${accent}" text-anchor="middle" font-weight="bold" opacity="0.8">PLAYER NAME</text>
    <text x="595" y="290" font-family="Impact,sans-serif" font-size="60" fill="${accent}" text-anchor="middle" opacity="0.8">23</text>
    <text x="595" y="460" font-family="Arial,sans-serif" font-size="11" fill="rgba(0,0,0,0.4)" text-anchor="middle">BACK PANEL</text>
  </svg>`;
}

// ─── 1. POST /api/ai/enhance ──────────────────────────────────────────────────
aiRouter.post('/enhance', async (req: any, res: any) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    const enhanced = `High-end hyper-detailed esports sublimation jersey pattern, themed around "${prompt}". Sharp aggressive vector panels, intense gradients, sleek technical lines, futuristic championship detailing, 8k resolution vector asset, flat sublimation print-ready artwork.`;
    return res.json({ enhancedPrompt: enhanced });
  } catch (error: any) {
    console.error('❌ Error enhancing prompt:', error);
    return res.json({ enhancedPrompt: req.body.prompt || '', note: 'Fallback applied.' });
  }
});

// ─── 2. POST /api/ai/generate ─────────────────────────────────────────────────
//
//  PIPELINE (Pure Recraft V4):
//  ┌─────────────────────────────────────────────────────────────────────────┐
//  │  User uploads jersey mockup reference image                            │
//  │            │                                                           │
//  │            ▼                                                           │
//  │  [IF referenceImage present]                                           │
//  │    → Recraft /vectorize endpoint                                       │
//  │      → Converts image directly to flat SVG — NO reinterpretation      │
//  │      → Exact same design, same colors, flat on white background        │
//  │                                                                        │
//  │  [IF no referenceImage — text only]                                    │
//  │    → Recraft Text-to-Image (recraftv3_vector)                         │
//  │      → Generates flat sublimation panel from prompt + colors           │
//  │                                                                        │
//  │  [IF no RECRAFT_API_KEY or network error]                              │
//  │    → Sandbox Simulator SVG fallback                                    │
//  └─────────────────────────────────────────────────────────────────────────┘
//
aiRouter.post('/generate', async (req: any, res: any) => {
  let cleanUserId = 'anonymous-session';
  let currentBalance = 10;

  try {
    const { prompt, baseColors, userId, referenceImage } = req.body;

    cleanUserId = userId || 'anonymous-session';
    const colors: string[] = baseColors || ['#ff0055', '#00ffcc', '#ffcc00'];

    // Sync token balance
    currentBalance = getUserTokens(cleanUserId);
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
      console.warn('[ai-gateway] Token Supabase query failed, using memory store');
    }

    if (currentBalance <= 0) {
      return res.status(403).json({
        error: 'OUT_OF_TOKENS',
        message: 'You have exhausted your free generation credits. Please subscribe to continue generating.'
      });
    }

    const recraftKey = process.env.RECRAFT_API_KEY;

    // ── SANDBOX MODE (no API key) ─────────────────────────────────────────
    if (!recraftKey) {
      console.log(`[DesignSync AI Gateway] No RECRAFT_API_KEY — serving Sandbox Simulator.`);
      await new Promise((r) => setTimeout(r, 900));
      const svgContent = generateSandboxSvg(colors);
      const dataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
      setUserTokens(cleanUserId, currentBalance - 1);
      return res.json({
        url: dataUri,
        type: 'vector',
        isSandbox: true,
        pipeline: 'sandbox-simulator',
        remainingTokens: currentBalance - 1,
        message: 'Generated in Sandbox Simulator Mode — add RECRAFT_API_KEY to .env for live generation.'
      });
    }

    // ── PATH A: StyleSync AI via Gemini Vision + Recraft V4.1 Pro Vector (mockup uploaded) ──
    // This is the PREMIUM approach matching top industry standards:
    //  1. Extract visual pattern details using Gemini Vision
    //  2. Merge extracted pattern description with user prompt modifications
    //  3. Strip silhouette boundaries and jersey wrinkles using a rigorous regex
    //  4. Synthesize flat native SVG using Recraft V4.1 Pro Vector
    if (referenceImage) {
      const isGrabber = req.body.pipeline === 'grabber';
      const geminiApiKey = process.env.GEMINI_API_KEY;

      if (isGrabber) {
        console.log(`\n══════════════ [Design Grabber: Recraft Vectorizer Service] ══════════════`);
        console.log(`• Input: 3D Reference Mockup Uploaded (Design Grabber Mode)`);
        console.log(`• Method: Recraft Image Vectorization (1:1 Tracing)`);
        
        if (!recraftKey) {
          return res.status(500).json({ error: 'RECRAFT_API_KEY is missing. Grabber requires Recraft API.' });
        }

        try {
          if (!referenceImage || typeof referenceImage !== 'string' || !referenceImage.includes(';base64,')) {
            console.error(`[Design Grabber] ❌ Invalid or empty referenceImage payload.`);
            return res.status(400).json({ error: 'Invalid or empty referenceImage payload.' });
          }

          const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');

          if (buffer.length === 0) {
            console.error(`[Design Grabber] ❌ referenceImage decoded to an empty buffer.`);
            return res.status(400).json({ error: 'Decoded reference image is empty.' });
          }

          console.log(`[Design Grabber] Decoded buffer size: ${buffer.length} bytes.`);

          // Construct FormData using form-data package for high Node compatibility
          const formData = new FormData();
          formData.append('file', buffer, { filename: 'mockup.png', contentType: 'image/png' });

          const recraftResponse = await fetch('https://external.api.recraft.ai/v1/images/vectorize', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${recraftKey}`,
              ...formData.getHeaders()
            },
            body: formData.getBuffer()
          });

          if (recraftResponse.ok) {
            const recraftData = await recraftResponse.json() as any;
            const resultUrl = recraftData.url || recraftData.image_url || recraftData.data?.[0]?.url;
            if (resultUrl) {
              console.log(`[Design Grabber] ✅ RECRAFT VECTORIZER SUCCESS → ${resultUrl}`);
              setUserTokens(cleanUserId, currentBalance - 1);
              return res.json({
                url: resultUrl,
                type: 'vector',
                isSandbox: false,
                pipeline: 'recraft-literal-vectorizer',
                remainingTokens: currentBalance - 1
              });
            } else {
              throw new Error('No valid URL found in Recraft response data.');
            }
          } else {
            const errText = await recraftResponse.text().catch(() => 'unknown');
            throw new Error(`Recraft Vectorizer API failed (${recraftResponse.status}): ${errText}`);
          }
        } catch (grabberErr: any) {
          console.error(`[Design Grabber] ❌ Recraft Vectorization failed:`, grabberErr);
          return res.status(500).json({ error: `Design Grabber failed: ${grabberErr.message}` });
        }
      }

      console.log(`\n══════════════ [StyleSync AI: Gemini + Recraft V4.1 Pro Vector] ══════════════`);
      console.log(`• Input: 3D Reference Mockup Uploaded`);
      console.log(`• Model: recraftv4_1_pro_vector`);
      let extractedPrompt = '';

      if (geminiApiKey) {
        console.log(`[StyleSync AI] 🔮 Calling Gemini Vision to extract design pattern...`);
        try {
          const mimeTypeMatch = referenceImage.match(/^data:(image\/\w+);base64,/);
          const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
          const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, '');
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
          
          const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType,
                      data: base64Data
                    }
                  },
                  {
                    text: 'Analyze the graphic design on this sports apparel mockup for a 2D flat sublimation blueprint conversion. Focus ONLY on the background patterns, colors, and geometric graphics (e.g. stripes, shapes, gradients). ABSOLUTELY IGNORE and EXCLUDE any brand logos, Nike swooshes, sponsor emblems, numbers, and text. Translate 3D shading and mannequin curves into flat, 2D vector coordinate descriptions of the background pattern only. Output only the background pattern description in English, and keep it concise and punchy.'
                  }
                ]
              }]
            })
          });

          if (geminiResponse.ok) {
            const geminiData = await geminiResponse.json() as any;
            extractedPrompt = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            console.log(`[StyleSync AI] ✅ Gemini Vision extracted: "${extractedPrompt}"`);
          } else {
            console.warn(`[StyleSync AI] ⚠️ Gemini Vision failed with status ${geminiResponse.status}. Falling back to default prompt.`);
          }
        } catch (geminiError: any) {
          console.error(`[StyleSync AI] ❌ Gemini Vision error:`, geminiError);
        }
      } else {
        console.warn(`[StyleSync AI] ⚠️ GEMINI_API_KEY is missing. Using standard text description fallback.`);
      }

      // Merge Gemini extracted description with any user text input
      let finalPrompt = extractedPrompt || 'sports jersey technical pattern';
      if (prompt && prompt.trim()) {
        finalPrompt = `${prompt.trim()}. Theme and visual details: ${finalPrompt}`;
      }

      // Rigorous Regex cleaning to strip out t-shirt boundaries, wrinkles, and common brand elements
      const garmentRegex = /\b(shirt|jersey|tshirt|t-shirt|mockup|mannequin|sleeve|collar|seams|fabric|wrinkle|folds|wear|clothing|apparel|polyester|mockup)\b/gi;
      finalPrompt = finalPrompt.replace(garmentRegex, 'graphic pattern');

      // Guarantee flat vector layout instructions in the prompt and order logo suppression
      finalPrompt = `flat vector sublimation sports graphic pattern, pure geometric background texture, print-ready, clean paths, tileable, strictly no logos, no text, no nike swooshes, no brand emblems, ${finalPrompt}`;
      console.log(`[StyleSync AI] Final cleaned prompt for Recraft: "${finalPrompt}"`);

      // Convert user hex colors to RGB format for Recraft's controls
      const rgbColors = colors.map((hex: string) => {
        const cleanHex = hex.replace('#', '');
        const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
        const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
        const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
        return { rgb: [r, g, b] };
      });

      // Parse similarity strength if provided by frontend, default to 0.50 to prevent foreground bleed-through
      const frontendStrength = req.body.similarityStrength;
      const parsedStrength = typeof frontendStrength === 'number' ? frontendStrength : 0.50;
      // Clamp strength between 0.40 and 0.55 if foreground text/logos might bleed
      const guidanceStrength = Math.min(Math.max(parsedStrength, 0.40), 0.55);

      console.log(`[StyleSync AI] Sending to Recraft V4.1 Pro Vector generations endpoint with strength ${guidanceStrength}...`);
      try {
        const recraftPayload = {
          prompt: finalPrompt,
          model: 'recraftv4_1_pro_vector',
          controls: {
            colors: rgbColors
          },
          image_guidance: {
            image: referenceImage,
            strength: guidanceStrength
          }
        };

        const recraftResponse = await fetch('https://external.api.recraft.ai/v1/images/generations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${recraftKey}`
          },
          body: JSON.stringify(recraftPayload)
        });

        if (recraftResponse.ok) {
          const recraftData = await recraftResponse.json() as any;
          const resultUrl = recraftData.data?.[0]?.url;
          if (resultUrl) {
            console.log(`[StyleSync AI] 🎨 SUCCESS → ${resultUrl}`);
            setUserTokens(cleanUserId, currentBalance - 1);
            return res.json({
              url: resultUrl,
              type: 'vector',
              isSandbox: false,
              pipeline: 'stylesync-gemini-recraftv4-pro-vector',
              remainingTokens: currentBalance - 1
            });
          }
        } else {
          const errText = await recraftResponse.text().catch(() => 'unknown');
          console.error(`[StyleSync AI] ❌ Recraft V4.1 Pro Vector failed (${recraftResponse.status}): ${errText}`);
          
          if (geminiApiKey) {
            console.log(`[StyleSync AI] 🔮 Recraft failed. Initiating direct Gemini Vision SVG Extraction fallback...`);
            try {
              const mimeTypeMatch = referenceImage.match(/^data:(image\/\w+);base64,/);
              const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
              const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, '');
              const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
              
              const colorsHex = colors.join(', ');
              
              const geminiResponse = await fetch(geminiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{
                    parts: [
                      {
                        inlineData: {
                          mimeType: mimeType,
                          data: base64Data
                        }
                      },
                      {
                        text: `You are an expert sports apparel graphic designer. Analyze the print design, patterns, and stripes on this sports jersey mockup.
Generate a premium, clean, high-fidelity, flat 2D vector SVG sublimation pattern sheet that extracts and recreates this design exactly.
Use the following dominant colors: ${colorsHex}.
The SVG must be flat, containing the pinstripes, panels, graphic layouts, and stripes matching the reference image.
The output must be pure, valid SVG code only, enclosed in \`\`\`xml ... \`\`\` blocks.
Absolutely ignore all shirt borders, necklines, sleeves, hangers, fabric folds, and mannequin silhouettes.`
                      }
                    ]
                  }]
                })
              });

              if (geminiResponse.ok) {
                const geminiData = await geminiResponse.json() as any;
                const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const svgMatch = text.match(/```xml([\s\S]*?)```/) || text.match(/```html([\s\S]*?)```/) || text.match(/<svg[\s\S]*?<\/svg>/);
                if (svgMatch) {
                  const svgCode = svgMatch[1] ? svgMatch[1].trim() : svgMatch[0].trim();
                  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svgCode).toString('base64')}`;
                  console.log(`[StyleSync AI] ✅ DIRECT GEMINI SVG SUCCESS!`);
                  setUserTokens(cleanUserId, currentBalance - 1);
                  return res.json({
                    url: dataUri,
                    type: 'vector',
                    isSandbox: false,
                    pipeline: 'stylesync-gemini-vision-direct-svg',
                    remainingTokens: currentBalance - 1
                  });
                }
              } else {
                console.error(`[StyleSync AI] ❌ Direct Gemini SVG fallback failed:`, geminiResponse.status);
              }
            } catch (geminiSvgErr: any) {
              console.error(`[StyleSync AI] ❌ Direct Gemini SVG error:`, geminiSvgErr);
            }
          }
        }
      } catch (recraftError: any) {
        console.error(`[StyleSync AI] ❌ Recraft API Error:`, recraftError);
        
        if (geminiApiKey) {
          console.log(`[StyleSync AI] 🔮 Recraft failed. Initiating direct Gemini Vision SVG Extraction fallback inside catch...`);
          try {
            const mimeTypeMatch = referenceImage.match(/^data:(image\/\w+);base64,/);
            const mimeType = mimeTypeMatch ? mimeTypeMatch[1] : 'image/png';
            const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, '');
            const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
            
            const colorsHex = colors.join(', ');
            
            const geminiResponse = await fetch(geminiUrl, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{
                  parts: [
                    {
                      inlineData: {
                        mimeType: mimeType,
                        data: base64Data
                      }
                    },
                    {
                      text: `You are an expert sports apparel graphic designer. Analyze the print design, patterns, and stripes on this sports jersey mockup.
Generate a premium, clean, high-fidelity, flat 2D vector SVG sublimation pattern sheet that extracts and recreates this design exactly.
Use the following dominant colors: ${colorsHex}.
The SVG must be flat, containing the pinstripes, panels, graphic layouts, and stripes matching the reference image.
The output must be pure, valid SVG code only, enclosed in \`\`\`xml ... \`\`\` blocks.
Absolutely ignore all shirt borders, necklines, sleeves, hangers, fabric folds, and mannequin silhouettes.`
                    }
                  ]
                }]
              })
            });

              if (geminiResponse.ok) {
                const geminiData = await geminiResponse.json() as any;
                const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
                const svgMatch = text.match(/```xml([\s\S]*?)```/) || text.match(/```html([\s\S]*?)```/) || text.match(/<svg[\s\S]*?<\/svg>/);
                if (svgMatch) {
                  const svgCode = svgMatch[1] ? svgMatch[1].trim() : svgMatch[0].trim();
                  const dataUri = `data:image/svg+xml;base64,${Buffer.from(svgCode).toString('base64')}`;
                  console.log(`[StyleSync AI] ✅ DIRECT GEMINI SVG SUCCESS!`);
                  setUserTokens(cleanUserId, currentBalance - 1);
                  return res.json({
                    url: dataUri,
                    type: 'vector',
                    isSandbox: false,
                    pipeline: 'stylesync-gemini-vision-direct-svg',
                    remainingTokens: currentBalance - 1
                  });
                }
              }
            } catch (geminiSvgErr: any) {
              console.error(`[StyleSync AI] ❌ Direct Gemini SVG error inside catch:`, geminiSvgErr);
            }
        }
      }

      console.log(`[StyleSync AI] ⚠️ StyleSync premium pipeline failed — falling through to standard Text-to-Image...`);
    }



    // ── PATH B: Text-to-Image Vector (no image, or vectorize failed) ──────
    console.log(`\n══════════════ [RECRAFT PIPELINE: TEXT-TO-IMAGE VECTOR] ══════════════`);
    const textPrompt = buildFlatExtractionPrompt(prompt, colors);
    console.log(`• Model: recraftv3_vector`);
    console.log(`• Prompt: "${textPrompt}"`);
    console.log(`• Colors: ${JSON.stringify(colors)}`);
    console.log(`════════════════════════════════════════════════════════════════════\n`);

    const t2iPayload = {
      prompt: textPrompt,
      model: 'recraftv3_vector',
      style: 'vector_illustration',
      colors: colors.map((c: string) => ({ hex: c })),
    };

    const t2iResponse = await fetch('https://external.api.recraft.ai/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${recraftKey}`,
      },
      body: JSON.stringify(t2iPayload)
    });

    if (!t2iResponse.ok) {
      const errText = await t2iResponse.text().catch(() => 'unknown');
      console.error(`[Recraft] ❌ Text-to-Image failed (${t2iResponse.status}): ${errText}`);
      
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (geminiApiKey) {
        console.log(`[Recraft] 🔮 Recraft failed. Initiating Gemini Text-to-SVG Synthesis fallback...`);
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
          const colorsHex = colors.join(', ');
          
          const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{
                parts: [{
                  text: `You are an expert sports apparel graphic designer.
Generate a premium, clean, high-fidelity, flat 2D vector SVG sublimation pattern sheet based on the following visual description: "${prompt}"
Use these dominant colors: ${colorsHex}.
The SVG must be flat, containing clean vector paths, geometric layouts, stripes, or patterns matching the theme.
The output must be pure, valid SVG code only, enclosed in \`\`\`xml ... \`\`\` blocks.
Absolutely ignore all shirt borders, necklines, sleeves, hangers, fabric folds, and mannequin silhouettes.`
                }]
              }]
            })
          });

          if (response.ok) {
            const geminiData = await response.json() as any;
            const text = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const svgMatch = text.match(/```xml([\s\S]*?)```/) || text.match(/```html([\s\S]*?)```/) || text.match(/<svg[\s\S]*?<\/svg>/);
            if (svgMatch) {
              const svgCode = svgMatch[1] ? svgMatch[1].trim() : svgMatch[0].trim();
              const dataUri = `data:image/svg+xml;base64,${Buffer.from(svgCode).toString('base64')}`;
              console.log(`[Recraft] ✅ GEMINI TEXT-TO-SVG SUCCESS!`);
              setUserTokens(cleanUserId, currentBalance - 1);
              return res.json({
                url: dataUri,
                type: 'vector',
                isSandbox: false,
                pipeline: 'gemini-text-to-svg-fallback',
                remainingTokens: currentBalance - 1
              });
            }
          }
        } catch (geminiTextSvgErr: any) {
          console.error(`[Recraft] ❌ Gemini Text-to-SVG error:`, geminiTextSvgErr);
        }
      }
      
      throw new Error(`Recraft API error (${t2iResponse.status}): ${errText}`);
    }

    const t2iData = (await t2iResponse.json()) as any;
    const resultUrl = t2iData.data?.[0]?.url;

    if (!resultUrl) {
      throw new Error('Recraft returned no image URL in response.');
    }

    console.log(`[Recraft] ✅ Text-to-Image SUCCESS → ${resultUrl}`);
    setUserTokens(cleanUserId, currentBalance - 1);
    return res.json({
      url: resultUrl,
      type: 'vector',
      isSandbox: false,
      pipeline: 'recraft-v3-text-to-image',
      remainingTokens: currentBalance - 1
    });

  } catch (error: any) {
    console.error('❌ Generation Gateway Error:', error);

    // Network/offline error — graceful sandbox fallback
    const isNetworkError =
      error.message?.includes('fetch failed') ||
      error.message?.includes('ENOTFOUND') ||
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('EHOSTUNREACH');

    if (!isNetworkError) {
      return res.status(500).json({
        error: 'GENERATION_FAILED',
        message: `AI Generation failed: ${error.message}`
      });
    }

    // Offline: serve sandbox fallback
    console.log(`[DesignSync AI Gateway] Network error — serving Sandbox Simulator fallback.`);
    const fallbackColors = req.body.baseColors || [];
    const svgContent = generateSandboxSvg(fallbackColors);
    const dataUri = `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`;
    setUserTokens(cleanUserId, currentBalance - 1);
    return res.json({
      url: dataUri,
      type: 'vector',
      isSandbox: true,
      errorOccurred: true,
      pipeline: 'sandbox-fallback',
      message: `Network offline: ${error.message}. Serving Sandbox Simulator.`,
      remainingTokens: currentBalance - 1
    });
  }
});

// ─── Prompt builder — strips all garment silhouette language ─────────────────
function buildFlatExtractionPrompt(userPrompt: string, colors: string[]): string {
  const base = (userPrompt || '').trim();

  // Core instruction: extract design flat on white background
  const extractionInstruction = [
    'flat sublimation sportswear design artwork',
    'front panel and back panel layout side by side on pure white background',
    'extract graphic design patterns only',
    'flat 2D vector artwork',
    'isolated design with no mannequin',
    'no human figure',
    'no t-shirt or jersey silhouette outline',
    'no background elements',
    'clean sharp vector paths',
    'print-ready sublimation art',
    'full bleed graphic layout',
  ].join(', ');

  const colorHint = colors.length > 0
    ? `dominant colors: ${colors.slice(0, 3).join(', ')}`
    : '';

  return [base, extractionInstruction, colorHint].filter(Boolean).join('. ');
}

// ─── 3. POST /api/ai/detect-polygons ─────────────────────────────────────────
// Polygon detection still uses Recraft vision or a fallback grid
aiRouter.post('/detect-polygons', async (req: any, res: any) => {
  try {
    const { referenceImage } = req.body;
    if (!referenceImage) {
      return res.status(400).json({ error: 'referenceImage is required' });
    }

    // Default garment polygon layout (front chest area approximation)
    // Returns a sensible default polygon if no AI vision is available
    const defaultPolygons = [
      // Front chest panel
      [[10, 15], [90, 15], [90, 85], [10, 85]],
      // Back panel (approximate)
      [[12, 15], [88, 15], [88, 85], [12, 85]]
    ];

    console.log(`[DesignSync AI Gateway] Polygon detection: using default layout polygons.`);

    return res.json({ polygons: defaultPolygons });
  } catch (error: any) {
    console.error('❌ Error detecting polygons:', error);
    return res.status(500).json({
      error: 'POLYGON_DETECTION_FAILED',
      message: `Failed to detect design regions: ${error.message}`
    });
  }
});

// ─── 4. POST /api/ai/remove-background ────────────────────────────────────────
aiRouter.post('/remove-background', async (req: any, res: any) => {
  try {
    const { referenceImage } = req.body;
    if (!referenceImage) {
      return res.status(400).json({ error: 'referenceImage is required' });
    }

    const recraftKey = process.env.RECRAFT_API_KEY;
    if (!recraftKey) {
      throw new Error('Missing RECRAFT_API_KEY');
    }

    const base64Data = referenceImage.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(base64Data, 'base64');

    const formData = new FormData();
    formData.append('file', buffer, { filename: 'image.png', contentType: 'image/png' });

    console.log('[DesignSync AI Gateway] Calling Recraft removeBackground...');
    const apiResponse = await fetch('https://external.api.recraft.ai/v1/images/removeBackground', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${recraftKey}`,
        ...formData.getHeaders()
      },
      body: formData.getBuffer()
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text().catch(() => 'unknown');
      throw new Error(`Recraft API error (${apiResponse.status}): ${errText}`);
    }

    const apiData = await apiResponse.json() as any;
    const resultUrl = apiData.image?.url || apiData.data?.[0]?.url;

    if (!resultUrl) {
      throw new Error('Recraft returned no URL in response.');
    }

    console.log(`[DesignSync AI Gateway] ✅ Background removed successfully: ${resultUrl}`);
    return res.json({ url: resultUrl });
  } catch (error: any) {
    console.error('❌ Error removing background:', error);
    // Graceful fallback to avoid user crashes if credits are exhausted
    console.log(`[DesignSync AI Gateway] Background removal failed: ${error.message}. Returning original image as fallback.`);
    return res.json({ url: req.body.referenceImage });
  }
});

// ─── 5. POST /api/ai/vectorize ───────────────────────────────────────────────
aiRouter.post('/vectorize', async (req: any, res: any) => {
  try {
    const { imageUrl } = req.body;
    if (!imageUrl) {
      return res.status(400).json({ error: 'imageUrl is required' });
    }

    // Bypass Recraft completely if image is already a vector SVG / data URI
    if (imageUrl.startsWith('data:image/svg+xml') || imageUrl.endsWith('.svg')) {
      console.log(`[DesignSync AI Gateway] Image is already a vector SVG format. Bypassing Recraft vectorize.`);
      return res.json({ url: imageUrl });
    }

    const recraftKey = process.env.RECRAFT_API_KEY;
    if (!recraftKey) {
      console.log(`[DesignSync AI Gateway] No RECRAFT_API_KEY for vectorization — returning original URL.`);
      return res.json({ url: imageUrl });
    }

    // Fetch image arraybuffer to convert to blob
    console.log(`[DesignSync AI Gateway] Fetching image from URL for vectorization: ${imageUrl}`);
    const imgRes = await fetch(imageUrl);
    if (!imgRes.ok) throw new Error(`Failed to fetch image from URL: ${imgRes.status}`);
    const arrayBuffer = await imgRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const formData = new FormData();
    formData.append('file', buffer, { filename: 'image.png', contentType: 'image/png' });

    console.log('[DesignSync AI Gateway] Calling Recraft vectorize...');
    const apiResponse = await fetch('https://external.api.recraft.ai/v1/images/vectorize', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${recraftKey}`,
        ...formData.getHeaders()
      },
      body: formData.getBuffer()
    });

    if (!apiResponse.ok) {
      const errText = await apiResponse.text().catch(() => 'unknown');
      throw new Error(`Recraft API error (${apiResponse.status}): ${errText}`);
    }

    const apiData = await apiResponse.json() as any;
    const resultUrl = apiData.image?.url || apiData.data?.[0]?.url;

    if (!resultUrl) {
      throw new Error('Recraft returned no URL in response.');
    }

    console.log(`[DesignSync AI Gateway] ✅ Vectorized successfully: ${resultUrl}`);
    return res.json({ url: resultUrl });
  } catch (error: any) {
    console.error('❌ Error vectorizing image:', error);
    // Graceful fallback to avoid user crashes if credits are exhausted
    console.log(`[DesignSync AI Gateway] Vectorization failed: ${error.message}. Returning original image as fallback.`);
    return res.json({ url: req.body.imageUrl });
  }
});

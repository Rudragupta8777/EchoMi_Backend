const OpenAI = require("openai");
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Translate text using OpenAI
 * @param {string} text - input text
 * @param {string} targetLang - target language code (e.g., "en", "hi", "es")
 * @param {string} sourceLang - optional source language
 */
const translateText = async (text, targetLang = "en", sourceLang = "auto") => {
  try {
    const systemPrompt = sourceLang === "auto"
      ? `You are a translation engine. Translate the following text into ${targetLang}. Detect the source language automatically.`
      : `You are a translation engine. Translate the following text from ${sourceLang} to ${targetLang}.`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",   // cost-efficient + fast
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: text }
      ],
      temperature: 0,
    });

    return response.choices[0].message.content.trim();
  } catch (err) {
    console.error("❌ Translation failed:", err.message);
    return text; // fallback
  }
};

module.exports = { translateText };

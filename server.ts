import express from "express";
import "dotenv/config";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import os from "os";
import axios from "axios";
import rateLimit from "express-rate-limit";
import cors from "cors";
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// ВАЖНО: Убрали старый GoogleAICacheManager, оставляем только главный клиент
import { GoogleGenAI } from "@google/genai";
import { SYSTEM_INSTRUCTION } from "./src/lib/prompt";

// --- Инициализация Firebase ---
let db: any = null;
try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const app = initializeApp(firebaseConfig);
    db = getFirestore(app);
  }
} catch (e) {
  console.warn("Firebase initialization skipped or failed.");
}

let caches: Record<string, string | null> = {
  "gemini-3.1-pro-preview": null,
  "gemini-3-flash-preview": null
};

// --- Лимиты запросов ---
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: "Too many requests, please try again later." }
});

const vinLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: { error: "Too many VIN lookups, please try again later." }
});

function resolveApiKey(frontendKey?: string): string {
  // Удалили все process.env. Просто возвращаем твой реальный ключ!
  // ОБЯЗАТЕЛЬНО ВСТАВЬ СВОЙ КЛЮЧ МЕЖДУ КАВЫЧКАМИ НИЖЕ:
  return "YRSECRETSRHERE";
}

// ─── Кэширование контекста (Новый синтаксис SDK) ────────────────────────────

async function getCache(apiKey: string, modelName: string) {
  if (caches[modelName]) return caches[modelName];

  console.log(`[TTTAPP] ⚡️ Создаем новый кэш промпта для ${modelName}...`);
  const ai = getGenAIClient(apiKey);
  
  // В новом SDK кэши создаются прямо через ai.caches
  const cache = await ai.caches.create({
    model: modelName,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      ttl: "3600s",
      displayName: `swagarage_rules_${modelName.replace(/\./g, '_')}`,
    }
  });

  caches[modelName] = cache.name || null;
  return cache.name;
}

function selectEstimationModel(files: any[]): string {
  const hasVideo = files.some(f => f.mimeType.startsWith("video/"));
  return (hasVideo || files.length >= 6) ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";
}

// ─── Главная логика оценки ──────────────────────────────────────────────────

async function estimateDamage(files: { data: string, mimeType: string }[], apiKey?: string, lang: string = 'ru') {
  const modelName = selectEstimationModel(files);
  const resolvedKey = resolveApiKey(apiKey);
  
  const genAI = new GoogleGenerativeAI(resolvedKey);
  const model = genAI.getGenerativeModel({ model: modelName });

  // Определяем название языка для промпта
  const languageName = lang === 'cs' ? 'Czech' : lang === 'ru' ? 'Russian' : 'English';

  const prompt = `
    You are a professional auto body repair estimator in Prague, Czech Republic.
    Analyze the uploaded images/videos and provide a detailed repair estimate.
    
    CRITICAL INSTRUCTIONS:
    1. LANGUAGE: Respond EXCLUSIVELY in ${languageName}. All part names and descriptions must be in ${languageName}.
    2. CURRENCY: Use CZK (Kč).
    3. LABOR RATE: Use 1000 Kč per hour (Nh).
    4. MATH LOGIC: For each repair, use the formula: (Repair Hours + Painting Hours) * 1000. 
       Example: (3.0 Nh repair + 4.5 Nh painting) * 1000 = 7500 Kč.
    
    OUTPUT FORMAT:
    You must return ONLY a JSON object with this structure:
    {
      "repairs": [{"name": "Name", "description": "Details", "cost": number, "type": "standard"}],
      "parts": [{"partName": "Name", "results": [{"category": "average", "retailPrice": number}]}],
      "totalCost": number,
      "confidence": number (0-1),
      "analysis": "Brief summary",
      "grey_flags": ["Warnings about hidden damage"]
    }
  `;

  const result = await model.generateContent([
    prompt,
    ...files.map(f => ({
      inlineData: { data: f.data, mimeType: f.mimeType }
    }))
  ]);

  const response = await result.response;
  const text = response.text();
  
  // Чистим ответ от лишних символов (маркдауна)
  const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
  
  try {
    const parsed = JSON.parse(jsonStr);
    
    // Финальная проверка структуры (наша "подушка безопасности")
    return {
      repairs: Array.isArray(parsed.repairs) ? parsed.repairs : [],
      parts: Array.isArray(parsed.parts) ? parsed.parts : [],
      grey_flags: Array.isArray(parsed.grey_flags) ? parsed.grey_flags : [],
      totalCost: parsed.totalCost || 0,
      confidence: parsed.confidence || 0,
      analysis: parsed.analysis || ""
    };
  } catch (e) {
    console.error("AI returned invalid JSON:", text);
    throw new Error("Не удалось распарсить ответ ИИ");
  }
}

  try {
    for (const file of files) {
      const isVideo = file.mimeType.startsWith("video/");
      const isLarge = file.data.length > 5 * 1024 * 1024;

      if (isVideo || isLarge) {
        const tempPath = path.join(os.tmpdir(), `up_${Date.now()}_${Math.random().toString(36).substring(7)}`);
        fs.writeFileSync(tempPath, Buffer.from(file.data, 'base64'));
        
        try {
          const upload = await ai.files.upload({ file: tempPath, config: { mimeType: file.mimeType } });
          if (!upload.name) {
            throw new Error("Upload failed: No file name returned from Google Cloud");
          }
          let info = await ai.files.get({ name: upload.name });
          
          let attempts = 0;
          while (info.state === "PROCESSING" && attempts < 30) {
            await new Promise(r => setTimeout(r, 2000));
            info = await ai.files.get({ name: upload.name });
            attempts++;
          }
          if (info.state === "FAILED") throw new Error("File processing failed in Google Cloud");
          
          uploadedFiles.push(upload.name!);
          parts.push({ fileData: { fileUri: upload.uri, mimeType: file.mimeType } });
        } finally {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        }
      } else {
        parts.push({ inlineData: { data: file.data, mimeType: file.mimeType } });
      }
    }

    // 1. Получаем имя кэша
    const cacheName = await getCache(resolvedKey, modelName);

    // 2. Делаем запрос с использованием кэша (Новый синтаксис)
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [{ parts: [...parts, { text: "Analyze damage strictly by rules. Show math in Nh. Output valid JSON." }] }],
      config: { 
        cachedContent: cacheName, // Передаем кэш вот сюда
        responseMimeType: "application/json", 
        temperature: 0.1 
      }
    });

const text = response.text || "{}";
    const jsonStr = text.replace(/```json\n?|\n?```/g, "").trim();
    
    let result;
    try {
      result = JSON.parse(jsonStr);
    } catch (e) {
      console.error("AI вернул невалидный JSON:", text);
      result = { totalCost: 0, confidence: 0 }; // Заглушка, если ИИ сошел с ума
    }

    // 🛡 ТА САМАЯ ПОДУШКА БЕЗОПАСНОСТИ ДЛЯ REACT:
    // Если ИИ забыл вернуть массивы, мы создаем их пустыми, чтобы .map() не падал
    if (!result.repairs || !Array.isArray(result.repairs)) result.repairs = [];
    if (!result.parts || !Array.isArray(result.parts)) result.parts = [];
    if (!result.grey_flags || !Array.isArray(result.grey_flags)) result.grey_flags = [];

    return result;

  } catch (e: any) {
    console.error("Estimation error:", e);
    throw e;
  } finally {
    // Очистка файлов
    for (const name of uploadedFiles) {
      try { await ai.files.delete({ name }); } catch (e) {}
    }
  }
}

// ─── Запуск Сервера ─────────────────────────────────────────────────────────

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.post("/api/estimate", apiLimiter, async (req, res) => {
    const { files, apiKey, lang } = req.body; // Добавь lang
const result = await estimateDamage(files, apiKey, lang); // Передай lang в функцию
    
    // Дефолтный пустой ответ, чтобы фронт не падал
    const fallbackResponse = {
      repairs: [],
      parts: [],
      grey_flags: [],
      totalCost: 0,
      confidence: 0,
      analysis: "Произошла ошибка или ИИ вернул пустой ответ"
    };

    if (!files?.length) {
      return res.status(400).json({ ...fallbackResponse, error: "No files provided" });
    }

    try {
      const result = await estimateDamage(files, apiKey);
      
      // Гарантируем наличие массивов перед отправкой
      const safeResult = {
        repairs: Array.isArray(result?.repairs) ? result.repairs : [],
        parts: Array.isArray(result?.parts) ? result.parts : [],
        grey_flags: Array.isArray(result?.grey_flags) ? result.grey_flags : [],
        totalCost: result?.totalCost || 0,
        confidence: result?.confidence || 0,
        analysis: result?.analysis || ""
      };
      
      res.json(safeResult);
    } catch (e: any) {
      console.error("🔴 ОШИБКА В ПОСТ-ОБРАБОТЧИКЕ:", e.message);
      // Даже при критической ошибке отдаем 200 OK и пустую структуру
      res.json({ 
        ...fallbackResponse, 
        analysis: "Ошибка сервера: " + e.message 
      });
    }
  });

  app.get("/api/vin/:vin", vinLimiter, async (req, res) => {
    try {
      const { vin } = req.params;
      const response = await axios.get(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`);
      const result = response.data.Results[0];
      res.json({
        make: result.Make || "Unknown",
        model: result.Model || "Unknown",
        year: result.ModelYear || "Unknown",
        found: !!result.Make
      });
    } catch (e) {
      res.status(500).json({ error: "VIN decode failed" });
    }
  });

  // Фронтенд
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(3000, "0.0.0.0", () => {
    console.log("🚀 Server running on port 3000 (Backend + API)");
  });
}

startServer();

function getGenAIClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({ apiKey });
}

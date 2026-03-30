import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || "" });

async function test() {
  try {
    const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    fs.writeFileSync(tempFilePath, Buffer.from("test", "utf-8"));
    
    const uploadResponse = await ai.files.upload({
      file: tempFilePath,
      config: {
        mimeType: "text/plain",
      }
    });
    
    console.log("Upload Success:", uploadResponse.name);
    
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ fileData: { fileUri: uploadResponse.uri, mimeType: "text/plain" } }, { text: "What is this file?" }] }],
      config: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });
    console.log("Generate Success:", response.text);
    
    await ai.files.delete({ name: uploadResponse.name });
    console.log("Delete Success");
  } catch (e) {
    console.error("Error:", e);
  }
}

test();

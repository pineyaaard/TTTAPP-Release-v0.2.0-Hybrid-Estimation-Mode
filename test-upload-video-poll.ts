import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || "" });

async function test() {
  try {
    const tempFilePath = path.join(os.tmpdir(), `upload_${Date.now()}_${Math.random().toString(36).substring(7)}.mp4`);
    // Create a dummy video file (just some random bytes)
    fs.writeFileSync(tempFilePath, Buffer.alloc(1024 * 1024, 0));
    
    console.log("Uploading file...");
    const uploadResponse = await ai.files.upload({
      file: tempFilePath,
      config: {
        mimeType: "video/mp4",
      }
    });
    
    console.log("Upload Success:", uploadResponse.name);
    
    console.log("Waiting for file to be processed...");
    let fileState = uploadResponse.state;
    while (fileState === "PROCESSING") {
      console.log("Polling...");
      await new Promise(resolve => setTimeout(resolve, 2000));
      const file = await ai.files.get({ name: uploadResponse.name });
      fileState = file.state;
    }
    
    if (fileState === "FAILED") {
      throw new Error("File processing failed.");
    }
    
    console.log("File is ACTIVE. Generating content...");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ fileData: { fileUri: uploadResponse.uri, mimeType: "video/mp4" } }, { text: "What is this video about?" }] }],
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


import { GoogleGenAI, Type } from "@google/genai";
import { ExtensionFile } from "./types";

// Always use process.env.API_KEY directly as required by the guidelines
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const SYSTEM_INSTRUCTION_BASE = `
    Bạn là một chuyên gia lập trình Chrome Extension thân thiện.
    QUY TẮC QUAN TRỌNG:
    1. TUYỆT ĐỐI KHÔNG khai báo phần "icons" trong manifest.json.
    2. TUYỆT ĐỐI KHÔNG khai báo "default_icon" trong phần "action".
    3. Đảm bảo manifest.json sử dụng Manifest V3.
    4. Code phải sạch sẽ, có comment tiếng Việt rõ ràng.
`;

const SIMPLE_EXPLANATION_GUIDE = `
    PHONG CÁCH TRẢ LỜI:
    - Giải thích như đang nói chuyện với bạn bè, dễ hiểu, dùng ví dụ thực tế.
    - Khi người dùng hỏi về một trang web cụ thể (ví dụ: labs.google, youtube...), hãy hiểu rằng họ đang muốn biết cách viết code (Content Script) để tương tác với trang đó.
    - Nếu cần, hãy sử dụng Google Search để tìm cấu trúc HTML/CSS (Selectors) mới nhất của trang web đó để đưa ra chỉ dẫn chính xác (như ID, Class của các nút bấm).
    - Luôn tập trung vào việc: "Làm sao để áp dụng thông tin này vào code Addon hiện tại".
`;

export const generateExtension = async (
  prompt: string, 
  image?: { data: string; mimeType: string }
): Promise<{ files: ExtensionFile[], name: string, description: string }> => {
  const model = "gemini-3-pro-preview";
  
  const parts: any[] = [{ text: `Yêu cầu tạo mới: ${prompt}` }];
  if (image) {
    parts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
  }

  const response = await ai.models.generateContent({
    model: model,
    contents: { parts },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION_BASE + "\nHãy trả về kết quả dưới dạng JSON theo schema đã định nghĩa.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          extensionName: { type: Type.STRING },
          extensionDescription: { type: Type.STRING },
          files: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                path: { type: Type.STRING },
                content: { type: Type.STRING },
                language: { type: Type.STRING }
              },
              required: ["path", "content", "language"]
            }
          }
        },
        required: ["extensionName", "extensionDescription", "files"]
      }
    }
  });

  const data = JSON.parse(response.text || '{}');
  return { name: data.extensionName, description: data.extensionDescription, files: data.files };
};

export const refineExtension = async (
  currentFiles: ExtensionFile[],
  request: string,
  image?: { data: string; mimeType: string }
): Promise<{ files: ExtensionFile[], name: string, description: string, explanation: string }> => {
  const model = "gemini-3-pro-preview";
  const context = currentFiles.map(f => `--- FILE: ${f.path} ---\n${f.content}`).join('\n\n');
  
  const parts: any[] = [{ text: `Đây là mã nguồn hiện tại:\n${context}\n\nYêu cầu chỉnh sửa hoặc thêm tính năng: ${request}` }];
  if (image) {
    parts.push({ inlineData: { data: image.data, mimeType: image.mimeType } });
  }

  const response = await ai.models.generateContent({
    model: model,
    contents: { parts },
    config: {
      systemInstruction: SYSTEM_INSTRUCTION_BASE + SIMPLE_EXPLANATION_GUIDE + "\nHãy cập nhật mã nguồn và trả về JSON chứa toàn bộ bộ file mới cùng phần giải thích chi tiết các thay đổi (explanation) bằng tiếng Việt theo phong cách dễ hiểu nhất.",
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          extensionName: { type: Type.STRING },
          extensionDescription: { type: Type.STRING },
          explanation: { type: Type.STRING, description: "Giải thích chi tiết các thay đổi theo phong cách bình dân, dễ hiểu." },
          files: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                path: { type: Type.STRING },
                content: { type: Type.STRING },
                language: { type: Type.STRING }
              },
              required: ["path", "content", "language"]
            }
          }
        },
        required: ["extensionName", "extensionDescription", "files", "explanation"]
      }
    }
  });

  const data = JSON.parse(response.text || '{}');
  return { 
    name: data.extensionName, 
    description: data.extensionDescription, 
    files: data.files,
    explanation: data.explanation || "Đã cập nhật mã nguồn theo yêu cầu."
  };
};

export interface ChatResponse {
  text: string;
  sources?: { title: string; uri: string }[];
}

export const chatWithAI = async (
  currentFiles: ExtensionFile[],
  message: string
): Promise<ChatResponse> => {
  const model = "gemini-3-flash-preview";
  const context = currentFiles.map(f => `File: ${f.path}`).join(', ');
  
  const response = await ai.models.generateContent({
    model: model,
    contents: `Project hiện tại có các file: ${context}. Câu hỏi của người dùng: ${message}`,
    config: {
      tools: [{ googleSearch: {} }],
      systemInstruction: "Bạn là trợ lý tư vấn lập trình Chrome Extension thân thiện. " + SIMPLE_EXPLANATION_GUIDE + " Hãy tập trung vào việc giải thích logic hoặc tìm kiếm cấu trúc trang web để hỗ trợ viết code can thiệp trang web."
    }
  });

  const sources = response.candidates?.[0]?.groundingMetadata?.groundingChunks
    ?.filter(chunk => chunk.web)
    .map(chunk => ({ title: chunk.web!.title || 'Nguồn tham khảo', uri: chunk.web!.uri }));

  return {
    text: response.text || "Xin lỗi, tôi không thể trả lời lúc này.",
    sources: sources && sources.length > 0 ? sources : undefined
  };
};

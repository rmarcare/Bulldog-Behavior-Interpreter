/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { GoogleGenAI, Type } from '@google/genai';
import { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { jsx as _jsx, jsxs as _jsxs } from 'react/jsx-runtime';

// --- TYPE DEFINITIONS ---
interface AnalysisResult {
  behavior: string;
  explanation: string;
  tip: string;
}

interface HistoryItem extends AnalysisResult {
  id: string;
  timestamp: string;
  file: {
    dataUrl: string; // base64 data URL
    type: string; // e.g., 'image/jpeg', 'video/mp4'
  };
  prompt: string;
}

// --- UTILITY FUNCTIONS ---
const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.onerror = (error) => reject(error);
  });


// --- MAIN APPLICATION COMPONENT ---
function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const storedHistory = localStorage.getItem('bulldogHistory');
      if (storedHistory) {
        setHistory(JSON.parse(storedHistory));
      }
    } catch (e) {
      console.error("Failed to load history from localStorage", e);
    }
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setPreviewUrl(URL.createObjectURL(selectedFile));
      setResult(null);
      setError(null);
    }
  };

  const handleAnalyze = async () => {
    if (!file) {
      setError('Please upload a photo or video first.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const base64Data = await fileToBase64(file);

      const filePart = {
        inlineData: { mimeType: file.type, data: base64Data },
      };
      
      const systemInstruction = "You are a specialized bulldog behavior expert. Analyze the provided image or video and text to identify bulldog behaviors. Provide a concise, plain-language explanation and a simple, actionable tip for the owner. Your response must be in JSON format.";

      const contents = `Analyze the bulldog's behavior in this image/video. Additional context from the owner: "${promptText || 'None'}".`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [filePart, { text: contents }] }],
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              behavior: { type: Type.STRING, description: "A short name for the behavior (e.g., 'Comfort Seeking')." },
              explanation: { type: Type.STRING, description: "A plain-language explanation of the likely behavior." },
              tip: { type: Type.STRING, description: "A simple, actionable tip for the owner." },
            },
            required: ["behavior", "explanation", "tip"],
          },
        },
      });

      const analysisResult: AnalysisResult = JSON.parse(response.text);
      setResult(analysisResult);

      const newHistoryItem: HistoryItem = {
        ...analysisResult,
        id: new Date().toISOString(),
        timestamp: new Date().toLocaleString(),
        file: {
          dataUrl: previewUrl!,
          type: file.type,
        },
        prompt: promptText,
      };

      const updatedHistory = [newHistoryItem, ...history].slice(0, 10); // Keep last 10
      setHistory(updatedHistory);
      localStorage.setItem('bulldogHistory', JSON.stringify(updatedHistory));

    } catch (e) {
      console.error(e);
      setError('Failed to analyze the media. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const renderMedia = (file: { dataUrl: string; type: string; }, alt: string, className?: string) => {
    if (file.type.startsWith('image/')) {
      return _jsx("img", { src: file.dataUrl, alt: alt, className: className });
    } else if (file.type.startsWith('video/')) {
      return _jsx("video", { src: file.dataUrl, controls: true, className: className });
    }
    return null;
  };

  return (
    _jsx("div", { className: "app-container", children: [
      _jsxs("header", { className: "header", children: [
        _jsx("h1", { children: "Bulldog Behavior Interpreter" }),
        _jsx("p", { children: "Upload a photo or video of your bulldog to understand their actions." })
      ] }),
      
      _jsx("main", { children: [
        _jsxs("section", { className: "card upload-section", children: [
          _jsx("h2", { children: "1. Upload Media" }),
          _jsx("input", { type: "file", accept: "image/*,video/*", ref: fileInputRef, onChange: handleFileChange, "aria-hidden": "true" }),
          _jsx("div", { 
            className: "upload-area", 
            onClick: () => fileInputRef.current?.click(),
            onKeyDown: (e) => { if (e.key === 'Enter') fileInputRef.current?.click(); },
            role: "button",
            tabIndex: 0,
            "aria-label": "Upload a photo or video of your bulldog",
            children: previewUrl && file
              ? renderMedia({ dataUrl: previewUrl, type: file.type }, "Bulldog preview", "preview-content")
              : _jsx("p", { className: "upload-instructions", children: "Click or tap here to select a photo or video" })
          }),
          _jsx("textarea", {
            className: "prompt-input",
            value: promptText,
            onChange: (e) => setPromptText(e.target.value),
            placeholder: "Optional: Add context (e.g., 'making a whining sound')...",
            "aria-label": "Additional context for behavior analysis"
          }),
          _jsxs("button", {
            className: "analyze-button",
            onClick: handleAnalyze,
            disabled: loading || !file,
            "aria-live": "polite",
            children: [
              loading && _jsx("div", { className: "loader" }),
              loading ? "Analyzing..." : "2. Analyze Behavior"
            ]
          })
        ]}),

        _jsxs("section", { className: "card results-section", children: [
          _jsx("h2", { children: "Analysis Result" }),
          loading && _jsx("div", { className: "placeholder", children: "Interpreting behavior..." }),
          error && _jsx("p", { className: "error-message", children: error }),
          !loading && !result && !error && _jsx("p", { className: "placeholder", children: "Your bulldog's behavior analysis will appear here." }),
          result && _jsxs("div", { children: [
            _jsx("p", { className: "results-disclaimer", children: "This is not veterinary or medical advice; consult a professional for health concerns." }),
            _jsx("h3", { children: "Behavior" }),
            _jsx("p", { children: result.behavior }),
            _jsx("h3", { children: "Explanation" }),
            _jsx("p", { children: result.explanation }),
            _jsx("h3", { children: "Actionable Tip" }),
            _jsx("p", { children: result.tip })
          ] })
        ]}),

        _jsxs("section", { className: "card history-section", children: [
          _jsx("h2", { children: "Recent Analyses" }),
          history.length === 0
            ? _jsx("p", { className: "placeholder", children: "Your analysis history is empty." })
            : _jsx("ul", { children: history.map(item => (
              _jsx("li", { className: "history-item", children: [
                renderMedia(item.file, `Analyzed bulldog - ${item.behavior}`, "history-media"),
                _jsxs("div", { className: "history-item-content", children: [
                  _jsx("h4", { children: item.behavior }),
                  _jsx("p", { children: `Analyzed on ${item.timestamp}` })
                ] })
              ]}, item.id)
            )) })
        ]})
      ]}),
      _jsx("footer", { className: "footer", children:
        _jsx("p", { children: "Disclaimer: This is not veterinary or medical advice. Always consult a professional for any health concerns regarding your pet." })
      })
    ]})
  );
}

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(_jsx(App, {}));

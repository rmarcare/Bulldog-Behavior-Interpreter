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

// --- UI COMPONENTS ---
const AudioIcon = () => (
    _jsx("div", { className: "history-audio-icon", children:
        _jsx("svg", { "aria-hidden": "true", focusable: "false", xmlns: "http://www.w3.org/2000/svg", viewBox: "0 0 24 24", children:
            _jsx("path", { d: "M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" })
        })
    })
);

// --- MAIN APPLICATION COMPONENT ---
function App() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [promptText, setPromptText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  
  // --- Live Capture State ---
  const [mode, setMode] = useState<'upload' | 'live'>('upload');
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // --- Refs ---
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- Effects ---
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

  useEffect(() => {
    // Cleanup stream when component unmounts or camera is turned off
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // --- Camera Handlers ---
  const handleStopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    setIsCameraOn(false);
    setStream(null);
  };

  const handleStartCamera = async () => {
    if (isCameraOn) return;
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setIsCameraOn(true);
      setError(null);
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access the camera. Please check permissions and try again.");
    }
  };

  const handleCapturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const context = canvas.getContext('2d');
      if (context) {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const capturedFile = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
            setFile(capturedFile);
            setPreviewUrl(URL.createObjectURL(capturedFile));
            setResult(null);
            setError(null);
            setMode('upload'); // Switch back to upload mode to show preview
          }
        }, 'image/jpeg');
      }
    }
    handleStopCamera();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    handleStopCamera(); // Stop camera if user chooses a file
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
      setError('Please upload or capture a media file first.');
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
      
      const systemInstruction = "You are a specialized bulldog behavior expert. Analyze the provided image, video, or audio and text to identify bulldog behaviors. Provide a concise, plain-language explanation and a simple, actionable tip for the owner. Your response must be in JSON format.";

      const contents = `Analyze the bulldog's behavior in this media. Additional context from the owner: "${promptText || 'None'}".`;

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

  const renderMedia = (file: { dataUrl: string; type: string; }, alt: string, className?: string, inHistory: boolean = false) => {
    if (file.type.startsWith('image/')) {
      return _jsx("img", { src: file.dataUrl, alt: alt, className: className });
    } else if (file.type.startsWith('video/')) {
      return _jsx("video", { src: file.dataUrl, controls: true, className: className });
    } else if (file.type.startsWith('audio/')) {
      if (inHistory) return _jsx(AudioIcon, {});
      return _jsx("audio", { src: file.dataUrl, controls: true, className: className });
    }
    return null;
  };
  
  const handleModeChange = (newMode: 'upload' | 'live') => {
    setMode(newMode);
    if (newMode === 'upload') {
        handleStopCamera();
    }
  };


  return (
    _jsx("div", { className: "app-container", children: [
      _jsxs("header", { className: "header", children: [
        _jsx("h1", { children: "Bulldog Behavior Interpreter" }),
        _jsx("p", { children: "Upload, capture, or record your bulldog to understand their actions." })
      ] }),
      
      _jsx("main", { children: [
        _jsxs("section", { className: "card upload-section", children: [
          _jsx("h2", { children: "1. Provide Media" }),
          
          _jsxs("div", { className: "mode-switcher", children: [
             _jsx("button", { className: mode === 'upload' ? 'active' : '', onClick: () => handleModeChange('upload'), children: "Upload File" }),
             _jsx("button", { className: mode === 'live' ? 'active' : '', onClick: () => handleModeChange('live'), children: "Live Capture" })
          ]}),

          mode === 'upload' && _jsxs("div", { children: [
             _jsx("input", { type: "file", accept: "image/*,video/*,audio/*", ref: fileInputRef, onChange: handleFileChange, style: { display: 'none' }, "aria-hidden": "true" }),
             _jsx("div", { 
                className: "upload-area", 
                onClick: () => fileInputRef.current?.click(),
                onKeyDown: (e) => { if (e.key === 'Enter') fileInputRef.current?.click(); },
                role: "button",
                tabIndex: 0,
                "aria-label": "Upload a photo, video, or audio file of your bulldog",
                children: previewUrl && file
                  ? renderMedia({ dataUrl: previewUrl, type: file.type }, "Bulldog preview", "preview-content")
                  : _jsx("p", { className: "upload-instructions", children: "Click or tap here to select a file" })
              }),
          ]}),

          mode === 'live' && _jsxs("div", { className: "live-capture-area", children: [
            !isCameraOn && _jsx("button", { className: "analyze-button", onClick: handleStartCamera, children: "Start Camera" }),
             isCameraOn && _jsxs("div", { className: "live-video-container", children: [
               _jsx("video", { ref: videoRef, autoPlay: true, playsInline: true, muted: true, className: "live-video" }),
               _jsx("canvas", { ref: canvasRef, style: { display: 'none' } })
            ]}),
            isCameraOn && _jsx("button", { className: "capture-button", onClick: handleCapturePhoto, children: "Capture Photo" })
          ]}),

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
              _jsxs("li", { className: "history-item", children: [
                renderMedia(item.file, `Analyzed bulldog - ${item.behavior}`, "history-media", true),
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
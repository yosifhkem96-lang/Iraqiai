require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const pdfParse = require('pdf-parse');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure Multer for PDF uploads (in-memory)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// PDF Upload Endpoint
app.post('/api/upload-pdf', upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'لم يتم رفع أي ملف.' });
  }

  try {
    const data = await pdfParse(req.file.buffer);
    res.json({ text: data.text });
  } catch (error) {
    console.error('PDF parsing error:', error);
    res.status(500).json({ error: 'فشل في قراءة ملف PDF.' });
  }
});

// Set up the API proxy endpoint
app.post('/api/chat', async (req, res) => {
  const { messages, mode } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Valid messages array is required' });
  }

  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    console.error("GEMINI_API_KEY is not set in environment variables");
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Define the specific Persona/System Instruction based on the user's selected mode
    let systemInstruction = "أنت مساعد ذكي مفيد ومؤدب باللهجة العراقية."; // Default

    if (mode === 'storyteller') {
      systemInstruction = `أنت معلم عراقي ذكي ومحبب، مهمتك هي شرح المناهج والنصوص ومحتويات الـ PDF للطلاب على شكل قصة عراقية شعبية مبسطة وحلوة مقتبسة من الشارع العراقي. 
استخدم لهجة عراقية واضحة ومحببة (مثل كلمات: زين، خوش، هيجي، جا، شكو ماكو، مو، هسة، لعد). اضرب أمثلة من الحياة اليومية في العراق لتبسيط المفاهيم المعقدة بطريقة مسلية وقصصية. ولا تخرج من هذه الشخصية أبداً.`;
    } else if (mode === 'examiner') {
      systemInstruction = `أنت أستاذ عراقي صارم قليلاً لكن محب لطلابه، مهمتك هي اختبار وامتحان الطلاب بمحتوى الـ PDF أو المادة التي يدرسونها. 
استخدم اللهجة العراقية في كلامك. اطرح أسئلة ذكية ومتدرجة الصعوبة لتقييم فهمهم للمادة، ولا تعطهم الإجابة مباشرة بل شجعهم على التفكير. (مثال: يلا عيني خل نشوف دراستك زينة لو لا، جاوبني على هذا السؤال...). ولا تخرج من هذه الشخصية أبداً.`;
    }

    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: systemInstruction
    });

    // Set up SSE headers for the client
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Convert messages for Gemini
    const geminiHistory = [];
    let currentMessage = "";

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.role === 'system') continue;

      if (i === messages.length - 1 && msg.role === 'user') {
        currentMessage = msg.content;
      } else {
        geminiHistory.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        });
      }
    }

    const chat = model.startChat({ history: geminiHistory });
    const result = await chat.sendMessageStream(currentMessage);

    for await (const chunk of result.stream) {
      const chunkText = chunk.text();
      // Format to match OpenAI/NVIDIA SSE delta structure so the frontend app.js doesn't break
      const dataPayload = {
        choices: [
          {
            delta: {
              content: chunkText
            }
          }
        ]
      };

      res.write(`data: ${JSON.stringify(dataPayload)}\n\n`);
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Gemini API error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to communicate with Gemini API' });
    } else {
      res.end();
    }
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

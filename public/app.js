document.addEventListener('DOMContentLoaded', () => {
    // Required libs should be on window
    const { marked } = window;
    const DOMPurify = window.DOMPurify;
    const hljs = window.hljs;

    // Configure marked to use highlight.js
    marked.setOptions({
        highlight: function (code, lang) {
            const language = hljs.getLanguage(lang) ? lang : 'plaintext';
            return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        breaks: true,
        gfm: true
    });

    // Theme Toggle Logic
    const themeToggleBtn = document.getElementById('theme-toggle');
    const htmlElement = document.documentElement;

    // Check local storage or system preference
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        htmlElement.classList.add('dark');
    } else {
        htmlElement.classList.remove('dark');
    }

    themeToggleBtn.addEventListener('click', () => {
        htmlElement.classList.toggle('dark');
        if (htmlElement.classList.contains('dark')) {
            localStorage.theme = 'dark';
        } else {
            localStorage.theme = 'light';
        }
    });

    const chatContainer = document.getElementById('chat-container');
    const chatMessages = document.getElementById('chat-messages');
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const emptyState = document.querySelector('.empty-state');
    const modeBtns = document.querySelectorAll('.mode-btn');

    // File Upload Elements
    const pdfUpload = document.getElementById('pdf-upload');
    const uploadBtn = document.getElementById('upload-btn');
    const fileAttachedBadge = document.getElementById('file-attached-badge');
    const fileNameDisplay = document.getElementById('file-name');
    const removeFileBtn = document.getElementById('remove-file-btn');
    const uploadStatus = document.getElementById('upload-status');

    const userMsgTemplate = document.getElementById('user-msg-template');
    const aiMsgTemplate = document.getElementById('ai-msg-template');

    // State
    let messages = []; // No initial system message, backend handles it
    let isGenerating = false;
    let abortController = null;
    let currentMode = 'storyteller'; // Default mode
    let attachedFileText = null;

    // Mode Selector Logic
    modeBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // Remove active classes from all
            modeBtns.forEach(b => {
                b.classList.remove('active', 'border-brand-500', 'bg-brand-500', 'text-white', 'shadow-md');
                b.classList.add('border-gray-300', 'dark:border-dark-800', 'bg-transparent', 'text-gray-600', 'dark:text-gray-300');
            });

            // Add active classes to clicked
            btn.classList.add('active', 'border-brand-500', 'bg-brand-500', 'text-white', 'shadow-md');
            btn.classList.remove('border-gray-300', 'dark:border-dark-800', 'bg-transparent', 'text-gray-600', 'dark:text-gray-300');

            currentMode = btn.dataset.mode;
        });
    });

    // File Upload Logic
    uploadBtn.addEventListener('click', () => {
        pdfUpload.click();
    });

    pdfUpload.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.type !== 'application/pdf') {
            alert('يرجى اختيار ملف بصيغة PDF فقط.');
            return;
        }

        // Show uploading status
        uploadStatus.style.opacity = '1';

        const formData = new FormData();
        formData.append('pdf', file);

        try {
            const response = await fetch('/api/upload-pdf', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error);
            }

            // Save the extracted text
            attachedFileText = data.text;

            // Show attached UI
            fileNameDisplay.textContent = file.name;
            fileAttachedBadge.classList.remove('hidden');

        } catch (err) {
            console.error(err);
            alert('حدث خطأ أثناء رفع الملف: ' + err.message);
        } finally {
            uploadStatus.style.opacity = '0';
            // Reset input so the same file could be selected again if removed
            e.target.value = '';
        }
    });

    removeFileBtn.addEventListener('click', () => {
        attachedFileText = null;
        fileAttachedBadge.classList.add('hidden');
    });

    // Auto-resize textarea
    userInput.addEventListener('input', function () {
        this.style.height = 'auto'; // Reset height
        const newHeight = Math.min(this.scrollHeight, 192); // max 48 * 4 roughly = 192 (12rem)
        this.style.height = (this.value ? newHeight : 48) + 'px';

        // Toggle button state based on content OR if there's a file attached
        checkSubmitButtonState();
    });

    function checkSubmitButtonState() {
        if (userInput.value.trim() !== '' || attachedFileText) {
            sendBtn.removeAttribute('disabled');
        } else {
            sendBtn.setAttribute('disabled', 'true');
        }
    }

    // Handle Enter to submit (Shift+Enter for newline)
    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if ((userInput.value.trim() || attachedFileText) && !isGenerating) {
                chatForm.dispatchEvent(new Event('submit'));
            }
        }
    });

    // Stop button
    stopBtn.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
            finishGeneration();
        }
    });

    // Scroll helper
    const scrollToBottom = () => {
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: 'smooth'
        });
    };

    // Chat Form Submit Handling
    chatForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const text = userInput.value.trim();
        // Allow submission if there's text OR a file attached
        if ((!text && !attachedFileText) || isGenerating) return;

        // Hide Empty state
        if (emptyState) {
            emptyState.style.display = 'none';
        }

        // Construct visually displayed text for the user
        let displayMsg = text;
        if (attachedFileText) {
            displayMsg = displayMsg ? `(مرفق ملف PDF)\n\n${displayMsg}` : `(مرفق ملف PDF)`;
        }

        // Add user message to UI
        appendUserMessage(displayMsg);

        // Construct the hidden payload sent to API
        let payloadText = text;
        if (attachedFileText) {
            payloadText = `وهذا هو النص المستخرج للدرس/الملزمة من ملف الـ PDF:\n\n"""\n${attachedFileText}\n"""\n\nالسؤال/الطلب: ${text}`;
        }

        // Reset input and file state
        userInput.value = '';
        userInput.style.height = '48px';
        attachedFileText = null;
        fileAttachedBadge.classList.add('hidden');
        checkSubmitButtonState();

        // Push to internal state
        messages.push({ role: "user", content: payloadText });

        // Trigger API request & handle stream
        await fetchChatResponse();
    });

    function appendUserMessage(text) {
        const clone = userMsgTemplate.content.cloneNode(true);
        const textDiv = clone.querySelector('div > div');
        textDiv.textContent = text;
        chatMessages.appendChild(clone);
        scrollToBottom();
    }

    async function fetchChatResponse() {
        // Toggle UI state
        isGenerating = true;
        abortController = new AbortController();

        userInput.setAttribute('readonly', 'true');
        userInput.classList.add('opacity-70');
        sendBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');

        // Prepare placeholder for AI text
        const clone = aiMsgTemplate.content.cloneNode(true);
        const aiContentBox = clone.querySelector('.ai-content');
        chatMessages.appendChild(clone);
        scrollToBottom();

        // The exact DOM element for appending the streamed text
        const responseBoxNode = ReactWrapper(aiContentBox);

        let fullContent = "";

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: messages,
                    mode: currentMode // Send the mode to the backend
                }),
                signal: abortController.signal
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }

            // Remove typing indicator as stream starts
            aiContentBox.innerHTML = '';
            aiContentBox.classList.add('blinking-cursor');

            const reader = response.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            // Read the stream
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                buffer += chunk;

                // Parse Server Sent Events format
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer

                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                            const data = JSON.parse(line.substring(6));
                            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                                fullContent += data.choices[0].delta.content;
                                responseBoxNode.render(fullContent);
                                // Scroll continuously if we are near the bottom
                                if (chatContainer.scrollHeight - chatContainer.scrollTop - chatContainer.clientHeight < 150) {
                                    chatContainer.scrollTop = chatContainer.scrollHeight;
                                }
                            }
                        } catch (err) {
                            console.warn('Error parsing SSE line:', line, err);
                        }
                    }
                }
            }

            // Add back the AI message to history
            messages.push({ role: "assistant", content: fullContent });

        } catch (error) {
            console.error('Fetch error:', error);
            if (error.name === 'AbortError') {
                responseBoxNode.render(fullContent + '\n\n*(توقف التوليد)*');
            } else {
                responseBoxNode.render(fullContent + `\n\n**خطأ:** ${error.message}`);
            }
        } finally {
            aiContentBox.classList.remove('blinking-cursor');
            finishGeneration();
            addCopyButtonsToCodeBlocks(aiContentBox);
        }
    }

    function finishGeneration() {
        isGenerating = false;
        abortController = null;
        userInput.removeAttribute('readonly');
        userInput.classList.remove('opacity-70');
        userInput.focus();
        stopBtn.classList.add('hidden');
        sendBtn.classList.remove('hidden');
        scrollToBottom();
    }

    function addCopyButtonsToCodeBlocks(container) {
        const codeBlocks = container.querySelectorAll('pre');
        codeBlocks.forEach(pre => {
            if (pre.querySelector('.copy-btn')) return; // Already added

            const btn = document.createElement('button');
            btn.className = 'copy-btn';
            btn.innerHTML = '<i class="ph ph-copy ml-1"></i> نسخ';

            btn.addEventListener('click', async () => {
                const code = pre.querySelector('code').innerText;
                try {
                    await navigator.clipboard.writeText(code);
                    btn.innerHTML = '<i class="ph ph-check text-green-400 ml-1"></i> تم النسخ';
                    setTimeout(() => {
                        btn.innerHTML = '<i class="ph ph-copy ml-1"></i> نسخ';
                    }, 2000);
                } catch (err) {
                    console.error('Failed to copy', err);
                }
            });

            pre.appendChild(btn);
        });
    }

    // A simple wrapper to update innerHTML by parsing Markdown then sanitizing
    function ReactWrapper(element) {
        return {
            render: (markdownText) => {
                const rawHtml = marked.parse(markdownText || '');
                const cleanHtml = DOMPurify.sanitize(rawHtml);
                element.innerHTML = cleanHtml;
            }
        };
    }

});

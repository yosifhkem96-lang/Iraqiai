require('dotenv').config();
const axios = require('axios');

async function testApi() {
    const invokeUrl = "https://integrate.api.nvidia.com/v1/chat/completions";
    const apiKey = process.env.NVIDIA_API_KEY;

    console.log("Using API Key:", apiKey ? apiKey.substring(0, 15) + "..." : "undefined");

    const payload = {
        model: "qwen/qwen2.5-72b-instruct",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 50,
        stream: false
    };

    try {
        const response = await axios.post(invokeUrl, payload, {
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            }
        });
        console.log("Success:", response.data);
    } catch (error) {
        console.error("Error Status:", error.response?.status);
        console.error("Error Data:", error.response?.data);
        console.error("Error Message:", error.message);
    }
}

testApi();

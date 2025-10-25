<div align="center">
  <img src="https://raw.githubusercontent.com/Rudragupta8777/EchoMi_App/main/app/src/main/res/drawable/app_logo.png" alt="EchoMi Logo" width="40%" />

  # ⚙️ EchoMi Backend: The Intelligence Layer
  
  <p align="center">
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" />
    <img src="https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=white" />
    <img src="https://img.shields.io/badge/MongoDB-47A248?style=for-the-badge&logo=mongodb&logoColor=white" />
    <img src="https://img.shields.io/badge/Twilio-F22F46?style=for-the-badge&logo=twilio&logoColor=white" />
    <img src="https://img.shields.io/badge/Firebase-FFCA28?style=for-the-badge&logo=firebase&logoColor=black" />
    <img src="https://img.shields.io/badge/WebSockets-181717?style=for-the-badge&logo=websocket&logoColor=white" />
    <img src="https://img.shields.io/badge/Deepgram-13EF93?style=for-the-badge&logo=deepgram&logoColor=black" />
    <img src="https://img.shields.io/badge/OpenAI-412991?style=for-the-badge&logo=openai&logoColor=white" />
  </p>
  
  <p align="center">
    <b>This repository houses the core Node.js application, responsible for real-time call processing, secure authentication, service orchestration, and data persistence for the EchoMi platform.</b>
  </p>
</div>

---

## 🏗️ System Architecture: Real-Time Flow

The EchoMi Backend is a **real-time, asynchronous orchestration layer** built on Node.js and WebSockets. It acts as the critical bridge between the external telephone network (Twilio), the AI processing units (Deepgram/OpenAI/Custom Model), and the user's mobile device (FCM/MongoDB).

### Call Processing Pipeline

The life cycle of an AI-handled call is a high-speed, multi-service transaction:

1.  **Incoming Call:** A user calls the EchoMi-managed Twilio number.
2.  **Webhook Trigger:** Twilio sends a webhook request to the **`POST /api/twilio/incoming`** endpoint.
3.  **WebSocket Handshake:** The backend instantly responds with TwiML, instructing Twilio to establish a **secure WebSocket connection (`wss://`)** back to the server.
4.  **Real-Time Media Stream:** Twilio streams raw, real-time audio data over the WebSocket connection.
5.  **STT & AI Orchestration:** The backend pipes the audio stream directly to **Deepgram (Speech-to-Text)**. Deepgram returns transcribed text in near real-time. This text is then sent to the **Custom AI Model Endpoint** (Python/ML service) for intent recognition, state management, and response generation.
6.  **TTS Response:** The AI Model returns a text response and the conversation state. The backend sends this text to **OpenAI/TTS Service** to generate the required audio, which is then sent back over the WebSocket to Twilio for playback to the caller.
7.  **Data Persistence:** The full transcript is saved to **MongoDB** immediately after each turn.

<div align="center">
  
</div>

---

## 🧩 Key Functional Components

### 1. Controllers (`controllers/`)

These files handle API routing, request validation and orchestrate logic between services and the database.

| Controller | Purpose | Key Functionality |
| :--- | :--- | :--- |
| `twilioController.js` | **Real-Time Call Handling** | Manages `POST /api/twilio/incoming` webhook, handles the **WebSocket connection (`handleWebSocketConnection`)**, initiates STT/TTS streams, and orchestrates the core AI conversation loop (including language detection and emergency/OTP checks). |
| `authController.js` | **User Management** | Handles user creation and login (`registerOrLoginUser`) using the Firebase UID passed from the mobile client. Initializes default user settings and AI prompts. |
| `smsController.js` | **Mobile Data Bridge** | Manages the secure storage and retrieval of recent SMS messages from the user's phone, which is critical for the OTP verification flow. Includes endpoints to **trigger FCM fetch requests** to the mobile app. |
| `summaryController.js` | **Post-Call Analysis** | Exposes endpoints for the UI to retrieve call summaries. Triggers the long-running process (`generateCallSummary`) for the AI to analyze the full transcript and context after the call ends. |
| `userSettingsController.js` | **Mobile State** | Allows the app to update user data like the **FCM token** (essential for sending alerts/approvals) and battery status. |

### 2. Services (`services/`)

These modules abstract external APIs and complex business logic, ensuring controllers remain clean.

| Service | Technology | Role |
| :--- | :--- | :--- |
| `sttService.js` | **Deepgram** | Manages the **Speech-to-Text** connection, converting the raw audio stream from Twilio into text for the AI model. |
| `ttsService.js` | **OpenAI TTS** | Manages the **Text-to-Speech** generation, converting the AI's response text into high-quality audio bytes sent back to the caller. |
| `smsVerificationService.js` | **Custom Logic / MongoDB** | The heart of the security flow. It scans stored SMS messages for OTPs, verifies tracking IDs, and manages the state of the user **approval requests** for unverified OTPs. |
| `fcmService.js` | **Firebase Admin SDK** | Handles all outbound communication to the user's mobile phone: sending **Emergency Alerts** and triggering the mobile app to **fetch new SMS/Location data**. |
| `summaryService.js` | **Custom AI Endpoint** | Handles the LLM call to generate a concise summary and key action items from the full call transcript. |
| `conversationManager.js` | **In-Memory Store** | Manages active WebSocket conversation states, crucial for resuming flows after a user approves an OTP via push notification. |

### 3. Data Models (`models/`)

Mongoose schemas defining the data structure.

* `User.js`, `UserSettings.js`: Stores authentication UID, Twilio number, and mobile FCM token.
* `CallLog.js`: The central record for every call. Stores metadata, **full, turn-by-turn transcripts**, and the final summary.
* `Sms.js`: Stores recent SMS history fetched securely from the mobile app (used for OTP verification).
* `Prompt.js`: Stores user-customizable AI instructions for different caller types (e.g., 'delivery', 'family', 'unknown').

---

## 🛡️ Security & Scalability

| Feature | Implementation Detail | Purpose |
| :--- | :--- | :--- |
| **Authentication** | **Firebase Admin SDK** (`authMiddleware.js`). Uses JWTs to verify user identity against Firebase UID, ensuring all API calls are authenticated. | Secures user-facing endpoints (logs, settings, prompts). |
| **Secrets Management** | **Base64 Environment Variable** (for Firebase service account) and `.env` files. | Prevents sensitive keys (API tokens, Firebase private key) from being committed to the repository. |
| **Real-Time Security** | Uses **WebSockets over HTTPS (`wss://`)** secured by Railway's load balancer. | Encrypts the audio media stream between Twilio and the backend. |
| **Port Handling** | Dynamic port binding (`process.env.PORT`) configured for robust cloud deployment (Railway). | Ensures the application correctly listens on the public port assigned by the hosting provider. |

---

## 🤝 Getting Started Locally

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/Rudragupta8777/EchoMi_Backend.git
    cd EchoMi_Backend
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Environment Setup:** Create a `.env` file in the root directory and populate it with your API keys (Twilio, Deepgram, OpenAI) and the required Firebase configuration (using the `FIREBASE_SERVICE_ACCOUNT_JSON` format for local testing).
4.  **Start the Local Server:**
    ```bash
    npm start
    ```

---

## 🔗 Related Repositories

| Repository | Role |
| :--- | :--- |
| **[EchoMi App](https://github.com/Rudragupta8777/EchoMi_App)** | The client-side Android application (Kotlin/FCM) |
| **[EchoMi AI Model](https://github.com/ruchit2005/EchoMi-AI-Model)** | The core machine learning and conversation logic endpoint (Python/ML) |

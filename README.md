# 🎓 Enhance Your Edu-Learning Platform

An AI-powered video conferencing platform built with React, Node.js, and WebRTC, designed specifically for educational environments with intelligent insights and cross-device compatibility.

## ✨ Features

### 🎯 Core Video Conferencing
- **HD Video & Audio**: Crystal clear video and audio streaming
- **Screen Sharing**: Share your entire screen, specific applications, or browser tabs
- **Meeting Management**: Create/join meetings with unique IDs
- **Real-time Chat**: Public and private messaging during meetings
- **Participant Controls**: Mute/unmute, video on/off, remove participants
- **Host Camera/Mic Requests**: Host can request camera/mic access from participants
- **Cross-Device Support**: Works on multiple devices simultaneously

### 🤖 AI Features
1. **Real-time Sentiment Analysis**: Analyze participant engagement and emotions
2. **AI Meeting Assistant**: Real-time transcription and smart follow-up questions
3. **Fatigue Detection**: Monitor participant engagement levels
4. **Performance Monitoring**: Real-time AI system performance tracking

## 🛠️ Technology Stack

### Frontend
- **React 18** - Modern UI framework
- **Material-UI** - Professional component library
- **WebRTC** - Real-time communication
- **Socket.IO Client** - Real-time signaling
- **TensorFlow.js** - AI model execution

### Backend
- **Node.js** - Server runtime
- **Express.js** - Web framework
- **Socket.IO** - Real-time communication
- **WebRTC** - Peer-to-peer video/audio

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ 
- npm or yarn
- Modern browser with WebRTC support

### Installation

1. **Install Frontend Dependencies**
   ```bash
   cd frontend
   npm install
   ```

2. **Install Backend Dependencies**
   ```bash
   cd ../backend
   npm install
   ```

3. **Start the Backend Server**
   ```bash
   npm start
   ```
   The backend will run on `http://localhost:5000`

4. **Start the Frontend Application**
   ```bash
   cd ../frontend
   npm start
   ```
   The frontend will open in your browser at `http://localhost:3000`

## 🌐 Cross-Device Setup

### For Multiple Devices (Recommended)

1. **Find Your IP Address**
   ```bash
   # Windows
   ipconfig
   
   # Mac/Linux
   ifconfig | grep "inet "
   ```

2. **Share with Other Devices**
   - **Your computer**: Use `http://localhost:3000`
   - **Other devices**: Use `http://YOUR_IP_ADDRESS:3000`
   - **Example**: `http://192.168.1.100:3000`

3. **Mobile Hotspot Setup** (Alternative)
   - Enable mobile hotspot on your phone
   - Connect all devices to the hotspot
   - Use the hotspot's IP address instead
   - **Note**: High data usage (400MB-2GB per hour for 4 participants)

### Network Configuration
- **Automatic Detection**: Frontend automatically detects network configuration
- **Firewall**: Ensure ports 3000 and 5000 are open
- **CORS**: Configured to allow all origins

## 📱 Usage

### Joining a Meeting
1. Enter your name in the "Your Name" field
2. Enter the meeting ID provided by the host
3. Click "Join Meeting"

### Creating a Meeting
1. Enter your name in the "Your Name" field
2. Click "Create Meeting"
3. Share the generated meeting ID with others

### Host Features
- **Request Camera/Mic Access**: Click "Request Camera/Audio Access" to request participant media
- **AI Analytics**: Click "🧠 Show AI Analytics" to view engagement metrics
- **Debug Tools**: Access troubleshooting and testing tools

## 🤖 AI Features Setup

### Option 1: Ollama (Local LLM) - RECOMMENDED
```bash
# Install Ollama
winget install Ollama.Ollama  # Windows
brew install ollama           # macOS
curl -fsSL https://ollama.ai/install.sh | sh  # Linux

# Start Ollama
ollama serve

# Download a model
ollama pull llama3.2:3b

# Test
ollama run llama3.2:3b "Hello, how are you?"
```

### Option 2: Rule-based (No Setup)
- Works out of the box with intelligent fallback questions

## 🔧 Development

### Project Structure
```
enhance-edu-learning-platform/
├── frontend/                 # React application
│   ├── src/
│   │   ├── components/      # React components
│   │   ├── hooks/          # Custom React hooks
│   │   ├── css/            # CSS stylesheets
│   │   ├── services/       # API services
│   │   └── utils/          # Utility functions
│   └── package.json
├── backend/                  # Node.js server
│   ├── server.js           # Main server file
│   └── package.json
└── README.md               # This file
```

### Available Scripts

#### Frontend
- `npm start` - Start development server
- `npm build` - Build for production
- `npm test` - Run tests

#### Backend
- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon

## 🌐 API Endpoints

### Health Check
- `GET /api/health` - Server status

### Meetings
- `POST /api/meetings` - Create a new meeting
- `GET /api/meetings/:meetingId` - Get meeting details

## 🔌 Socket.IO Events

### Client to Server
- `join-meeting` - Join a meeting room
- `offer` - WebRTC offer
- `answer` - WebRTC answer
- `ice-candidate` - WebRTC ICE candidate
- `chat-message` - Send chat message
- `leave-meeting` - Leave meeting room
- `media-state-change` - Update media state
- `host-camera-mic-request` - Request camera/mic access

### Server to Client
- `meeting-joined` - Confirmation of joining
- `participant-joined` - New participant notification
- `participant-left` - Participant departure notification
- `offer/answer/ice-candidate` - WebRTC signaling
- `chat-message` - Receive chat message
- `participant-media-state-changed` - Media state update
- `follow-up-suggestion` - AI-generated questions

## 🎯 AI Features

### Real-time Sentiment Analysis
- **Local Processing**: All facial analysis happens on device
- **Privacy-First**: No raw video data transmitted
- **Engagement Tracking**: Monitor participant engagement levels
- **Real-time Dashboard**: Live engagement metrics for hosts

### AI Question Generation
- **Real-time Transcription**: Continuous audio processing
- **Contextual Questions**: AI-generated follow-up questions
- **Multiple LLM Support**: Ollama or rule-based
- **Smart Timing**: Questions generated every 30 seconds

### Performance Monitoring
- **Real-time Metrics**: Track AI system performance
- **Success Rates**: Monitor LLM and sentiment analysis success
- **Response Times**: Track average response times
- **Resource Usage**: Monitor memory and CPU usage

## 🔒 Privacy & Security

### Data Protection
- **Local Processing**: All facial analysis happens on device
- **No Raw Video**: Video data never leaves the device
- **Anonymized Data**: Only sentiment scores are transmitted
- **Temporary Storage**: Data is retained for 30 seconds maximum
- **User Control**: Participants can opt-out at any time

### Compliance
- **GDPR Compliant**: No personal data is stored
- **CCPA Compliant**: Users control their data
- **FERPA Compliant**: Educational data protection
- **HIPAA Ready**: Can be configured for healthcare use

## 🚧 Troubleshooting

### Common Issues

#### Connection Problems
- **Check IP Address**: Ensure correct IP address is used
- **Firewall Settings**: Allow Node.js through firewall
- **Network**: Ensure all devices are on same network
- **Ports**: Verify ports 3000 and 5000 are open

#### Audio/Video Issues
- **Browser Permissions**: Grant camera/microphone access
- **Browser Compatibility**: Use Chrome for best support
- **Device Compatibility**: Run compatibility test in meeting room
- **Audio Troubleshooter**: Use built-in audio diagnostic tools

#### AI Features Issues
- **Model Loading**: Check if AI models are properly loaded
- **Performance**: Monitor AI performance dashboard
- **LLM Setup**: Verify Ollama configuration
- **Console Logs**: Check browser console for errors

### Browser Compatibility
- ✅ **Chrome** (Best support)
- ✅ **Firefox** (Good support)
- ✅ **Safari** (Limited support)
- ✅ **Edge** (Good support)

## 📊 Performance

### Expected Performance
- **Model Loading**: 2-5 seconds
- **Face Detection**: 50-100ms per frame
- **Emotion Detection**: 100-200ms per face
- **LLM Response**: < 2 seconds average
- **Memory Usage**: 50-100MB additional for AI features

### Optimization Tips
1. **Use WebGL**: Enable GPU acceleration for AI models
2. **Quality Settings**: Adjust video quality based on device performance
3. **Network**: Use stable internet connection
4. **Browser**: Use Chrome for optimal performance

## 🚧 Roadmap

### Phase 1: Core Features ✅
- [x] Meeting lobby interface
- [x] Basic WebRTC video/audio
- [x] Screen sharing
- [x] Real-time chat
- [x] Cross-device compatibility
- [x] Host camera/mic requests

### Phase 2: AI Features ✅
- [x] Real-time sentiment analysis
- [x] AI question generation
- [x] Fatigue detection
- [x] Performance monitoring

### Phase 3: Advanced Features
- [ ] Breakout rooms
- [ ] Meeting recording
- [ ] Virtual backgrounds
- [ ] Polls and surveys
- [ ] Advanced analytics

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the troubleshooting section
- Use built-in diagnostic tools
- Contact the development team

---

**Built with ❤️ for seamless video communication**

**Ready to enhance your meetings with AI-powered insights!** 🚀🧠
// Data stores for the application
export const activeMeetings = new Map();
export const sentimentData = new Map();
export const fatigueData = new Map();
export const highlightData = new Map();
export const recordingSessions = new Map();
export const transcriptData = new Map();

// Performance monitoring data
export const performanceData = {
  llmService: null,
  sentimentAnalysis: {
    activeParticipants: 0,
    analysisInterval: 3000,
    totalAnalyses: 0,
    successfulAnalyses: 0
  },
  fatigueDetection: {
    currentFatigueLevel: 0,
    alertsGenerated: 0,
    activeMeetings: 0
  },
  systemResources: {
    memoryUsage: 'N/A',
    cpuUsage: 'N/A'
  },
  overallStatus: 'good'
};

// Persistent data stores
export const persistentMeetings = new Map();
export const persistentHighlights = new Map();
export const persistentTranscripts = new Map();


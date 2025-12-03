import llmService from '../src/utils/llmService.js';
import { performanceData, sentimentData, fatigueData } from '../config/stores.js';

/**
 * Update performance data
 */
export function updatePerformanceData() {
  // Update LLM service performance
  performanceData.llmService = llmService.getPerformanceStats();
  
  // Update sentiment analysis data
  performanceData.sentimentAnalysis.activeParticipants = sentimentData.size;
  
  // Update fatigue detection data
  performanceData.fatigueDetection.activeMeetings = fatigueData.size;
  
  // Calculate overall status
  const llmSuccessRate = parseFloat(performanceData.llmService?.successRate || '0');
  const sentimentSuccessRate = performanceData.sentimentAnalysis.totalAnalyses > 0 
    ? (performanceData.sentimentAnalysis.successfulAnalyses / performanceData.sentimentAnalysis.totalAnalyses * 100)
    : 100;
  
  if (llmSuccessRate >= 90 && sentimentSuccessRate >= 90) {
    performanceData.overallStatus = 'excellent';
  } else if (llmSuccessRate >= 75 && sentimentSuccessRate >= 75) {
    performanceData.overallStatus = 'good';
  } else if (llmSuccessRate >= 50 && sentimentSuccessRate >= 50) {
    performanceData.overallStatus = 'fair';
  } else {
    performanceData.overallStatus = 'poor';
  }
}

export { performanceData };


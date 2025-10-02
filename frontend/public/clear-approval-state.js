// Clear all approval-related data from localStorage
console.log('🧹 Clearing approval state...');

// Clear all approval entries
Object.keys(localStorage).forEach(key => {
  if (key.startsWith('approved_') || key.includes('approval') || key.includes('meeting')) {
    console.log('🗑️ Removing:', key);
    localStorage.removeItem(key);
  }
});

// Clear sessionStorage
sessionStorage.clear();

// Clear any global variables
if (window.meetingState) {
  delete window.meetingState;
}
if (window.pendingApprovals) {
  delete window.pendingApprovals;
}

console.log('✅ Approval state cleared!');
console.log('💡 Now refresh the page and try again');

// Auto-refresh after 2 seconds
setTimeout(() => {
  console.log('🔄 Refreshing page...');
  location.reload();
}, 2000);

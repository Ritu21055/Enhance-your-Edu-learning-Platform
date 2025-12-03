// Meeting-related socket event handlers
import { activeMeetings } from '../config/stores.js';
import llmService from '../src/utils/llmService.js';

/**
 * Register meeting-related socket event handlers
 * @param {Socket} socket - Socket.IO socket instance
 * @param {Server} io - Socket.IO server instance
 */
export default function registerMeetingHandlers(socket, io) {
  // Join meeting room
  socket.on('join-meeting', ({ meetingId, userName, meetingTitle, isHost: frontendIsHost, password, setPassword }) => {
    // CRITICAL: IGNORE frontend isHost value - backend determines host status
    // CRITICAL: Log all join-meeting attempts for debugging
    console.log(`🔵 join-meeting received:`, {
      socketId: socket.id,
      userName,
      meetingId,
      frontendIsHost,
      hasPassword: !!password,
      passwordLength: password ? password.length : 0,
      setPassword: setPassword !== undefined ? (setPassword || 'null/empty') : 'undefined',
      isHostSettingPassword: setPassword !== undefined
    });
    
    // Handle empty or undefined userName
    if (!userName || userName.trim() === '') {
      userName = 'Guest';
    }

    let meeting = activeMeetings.get(meetingId);
    
    // PASSWORD SETTING: If host is creating meeting and providing password
    // CRITICAL: If setPassword is explicitly provided (even if null/empty), user is the host
    // If setPassword is undefined, user is NOT setting password (participant or host not setting password)
    const isHostSettingPassword = setPassword !== undefined; // Host is setting password (even if null/empty)
    
    if (isHostSettingPassword) {
      if (!meeting) {
        // Create meeting first
        const finalTitle = meetingTitle || `Meeting ${meetingId}`;
        meeting = {
          id: meetingId,
          title: finalTitle,
          host: `${userName} (Host)`,
          hostId: socket.id, // CRITICAL: Set hostId immediately when host creates meeting with password
          participants: [],
          password: (setPassword && setPassword.trim() !== '') ? setPassword.trim() : null,
          createdAt: new Date(),
          status: 'active'
        };
        activeMeetings.set(meetingId, meeting);
        console.log(`🏠 Host creating meeting ${meetingId} with password: ${meeting.password ? 'set' : 'none'}, hostId: ${socket.id}`);
      } else {
        // Update existing meeting password (only if no password exists or user is host)
        const isActuallyHost = meeting.hostId === socket.id;
        const isFirstParticipant = !meeting.hostId && meeting.participants.length === 0;

        if (isActuallyHost || isFirstParticipant) {
          meeting.password = (setPassword && setPassword.trim() !== '') ? setPassword.trim() : null;
          // CRITICAL: If this is the first participant setting password, set them as host
          if (isFirstParticipant && !meeting.hostId) {
            meeting.hostId = socket.id;
            meeting.host = `${userName} (Host)`;
            console.log(`🏠 First participant setting password - setting as host with hostId: ${socket.id}`);
          }
          console.log(`🔒 Meeting password ${meeting.password ? 'set' : 'removed'} for meeting ${meetingId}`);
        }
      }
    }
    
    // Check if participant already exists in this meeting (by socket ID)
    // BUT: Don't skip password check if this is a new join attempt with password
    // CRITICAL: If host is setting password, skip this check - they should join as host
    if (meeting && !isHostSettingPassword) {
      const existingParticipant = meeting.participants.find(p => p.id === socket.id);
      if (existingParticipant) {
        // CRITICAL: If password is provided, user is a participant (not host)
        // Even if they were previously marked as host, password verification means they're a participant
        if (password && password.trim() !== '') {
          // Password was provided = user is participant, force participant status
          existingParticipant.isHost = false;
          existingParticipant.name = existingParticipant.name.replace(' (Host)', '');
          const isActuallyHost = false; // Password provided = not host
          
          // Verify password
          if (meeting.password && meeting.password.trim() !== '' && password.trim() !== meeting.password.trim()) {
            socket.emit('meeting-password-required', {
              meetingId: meetingId,
              error: 'Incorrect password. Please try again.'
            });
            return;
          }
          
          // Password verified, send meeting info with participant status
          socket.emit('meeting-info', {
            meetingId,
            hostId: meeting.hostId,
            hostName: meeting.host,
            participants: meeting.participants,
            isHost: false // Password provided = participant
          });
          return;
        }
        
        // If password is required but not provided, ask for it
        if (meeting.password && meeting.password.trim() !== '') {
          const isActuallyHost = meeting.hostId === socket.id;
          if (!isActuallyHost) {
            // Verify password for existing participant reconnecting
            socket.emit('meeting-password-required', {
              meetingId: meetingId,
              error: 'This meeting requires a password.'
            });
            return;
          }
        }
        
        // CRITICAL: Ensure participant is not incorrectly marked as host
        // Only the actual host (by hostId) should be marked as host
        const isActuallyHost = meeting.hostId === socket.id;
        if (existingParticipant.isHost && !isActuallyHost) {
          existingParticipant.isHost = false;
          existingParticipant.name = existingParticipant.name.replace(' (Host)', '');
        }
        
        // Just send meeting info without adding to pending approvals
        socket.emit('meeting-info', {
          meetingId,
          hostId: meeting.hostId,
          hostName: meeting.host,
          participants: meeting.participants,
          isHost: isActuallyHost // Use actual host check, not stored value
        });
        
        return;
      }
    
      // Check if same user name already exists (for multi-tab scenarios)
      const existingUser = meeting.participants.find(p => p.name === userName && p.id !== socket.id);
      if (existingUser) {
        // For multi-tab scenarios, add a simple number suffix
        const uniqueUserName = `${userName} (${meeting.participants.length + 1})`;
        userName = uniqueUserName;
      }
      
    }
    
    // If meeting doesn't exist, create it automatically
    if (!meeting) {
      const finalTitle = meetingTitle || `Meeting ${meetingId}`;
      
      meeting = {
        id: meetingId,
        title: finalTitle, // Use provided title or default
        host: null, // Will be set later if user becomes host
        hostId: null, // Will be set later if user becomes host
        participants: [],
        password: null, // Meeting password (optional)
        createdAt: new Date(),
        status: 'active'
      };
      activeMeetings.set(meetingId, meeting);
    }
    
    // CRITICAL: IGNORE frontend isHost value - determine host status purely from backend state
    // Host determination rules (in order of priority):
    // 1. If meeting has NO host yet AND this is the first participant -> becomes host
    // 2. If meeting has a host AND this socket ID matches hostId -> reconnecting host (same socket)
    // 3. If meeting has a host BUT host socket is disconnected AND username matches host name -> reconnecting host (new socket)
    // 4. Otherwise -> participant (must wait for approval)
    
    // CRITICAL: Check if hostId exists - if it does, only that socket or same username can be host
    const hasExistingHost = !!meeting.hostId;
    
    // Check if this is the original host reconnecting (socket ID matches hostId)
    const isOriginalHostReconnecting = hasExistingHost && meeting.hostId === socket.id;
    
    // Check if host socket is still connected
    const hostSocket = hasExistingHost ? io.sockets.sockets.get(meeting.hostId) : null;
    const hostSocketConnected = !!hostSocket;
    
    // Check if this is the host reconnecting with a new socket ID (by username match)
    // Only allow this if:
    // 1. There's a hostId set
    // 2. The host socket is NOT connected (host disconnected)
    // 3. The username matches the host's name (extracted from meeting.host)
    // 4. There are no active participants (only pending approvals or empty)
    let isHostReconnectingByUsername = false;
    if (hasExistingHost && !hostSocketConnected && meeting.host) {
      const hostBaseName = meeting.host.replace(' (Host)', '').trim();
      const joiningBaseName = userName.replace(' (Host)', '').trim();
      const noActiveParticipants = meeting.participants.length === 0;
      
      if (hostBaseName === joiningBaseName && noActiveParticipants) {
        isHostReconnectingByUsername = true;
        console.log(`🔄 Host reconnecting by username: ${userName} (old socket: ${meeting.hostId}, new socket: ${socket.id})`);
      }
    }
    
    // CRITICAL: If meeting has a password and user hasn't provided it, they CANNOT be the first participant (host)
    // Only the host sets the password, so if a password exists, there must already be a host
    // This prevents participants from becoming host when they join without password
    // EXCEPTION: If user is SETTING the password (setPassword is provided, even if null), they ARE the host
    const meetingHasPassword = meeting && meeting.password && meeting.password.trim() !== '';
    const userProvidedPassword = password && password.trim() !== '';
    const userIsSettingPassword = setPassword !== undefined; // Host is setting password (even if null/empty)
    
    // Check if this is the first participant (NO host exists AND no participants)
    // CRITICAL: Only true if BOTH conditions: no hostId AND no participants
    // IMPORTANT: Check participants length BEFORE filtering (line 200-206)
    // Also check if there are any participants with isHost=true to be extra safe
    // CRITICAL: If meeting has password and user didn't provide it AND user is NOT setting password, they cannot be first participant
    // If user IS setting password, they are the host creating the meeting, so allow them to be first participant
    const participantsBeforeFilter = meeting.participants.length;
    const hasAnyHostParticipant = meeting.participants.some(p => p.isHost);
    // Allow first participant if: no host exists, no participants, AND either no password OR user is setting password
    const passwordBlocksFirstParticipant = meetingHasPassword && !userProvidedPassword && !userIsSettingPassword;
    const isFirstParticipant = !hasExistingHost && participantsBeforeFilter === 0 && !hasAnyHostParticipant && !passwordBlocksFirstParticipant;
    
    // CRITICAL: Check password BEFORE determining host status
    // If meeting has password and user didn't provide it, they CANNOT be host
    // This must happen BEFORE we set finalIsActuallyHost
    // EXCEPTION: If user is SETTING the password (setPassword), they ARE the host
    let passwordBlocksHost = false;
    if (meeting && meeting.password && meeting.password.trim() !== '') {
      const providedPassword = password ? password.trim() : '';
      
      // If user provided password (for verification), they're definitely a participant (not host)
      if (providedPassword !== '') {
        // User provided password = they're a participant, not host
        passwordBlocksHost = true;
        console.log(`🔒 User provided password - cannot be host. User: ${userName} (${socket.id})`);
      } else {
        // User didn't provide password but meeting has one
        // They cannot be host - only the host who set the password can be host
        // Exception: 
        // 1. If this is the original host reconnecting (they set the password)
        // 2. If this is the first participant AND they're setting the password (host creating meeting)
        // 3. If user is setting password (they ARE the host, even if meeting already has password)
        // 4. If meeting has password but no host (hostId is null) AND user is setting password (host reclaiming meeting)
        // 5. If meeting has password but no host (hostId is null) AND user is trying to join as host (frontend says isHost: true)
        //    AND there are no active participants (host can reclaim their meeting)
        const isSettingPassword = setPassword !== undefined; // Host is setting password (even if null/empty)
        const meetingHasNoHost = !meeting.hostId; // Meeting has no host (hostId is null)
        const noActiveParticipants = meeting.participants.length === 0; // No active participants
        const userWantsToBeHost = frontendIsHost === true; // Frontend indicates user wants to be host
        // CRITICAL: If host is setting password and meeting has no host, allow them to reclaim
        // If user is setting password (setPassword !== undefined), they're trying to set/change the password
        // This should only be allowed for the host, so if they're setting password, they're the host
        // Security: If meeting has no host and user sends setPassword, allow them to become host
        // This is safe because setting password is a host action, so only the host would do it
        const canReclaimHost = meetingHasNoHost && (isSettingPassword || (userWantsToBeHost && noActiveParticipants)); // Can reclaim host if no host exists and (setting password OR wants to be host with no participants)
        const canBeHost = isOriginalHostReconnecting || isHostReconnectingByUsername || isFirstParticipant || isSettingPassword || canReclaimHost;
        
        if (!canBeHost) {
          passwordBlocksHost = true;
          console.log(`🔒 Meeting has password but user didn't provide it - cannot be host. User: ${userName} (${socket.id}), HostId: ${meeting.hostId}, isSettingPassword: ${isSettingPassword}, canReclaimHost: ${canReclaimHost}`);
        } else {
          console.log(`✅ User can be host despite password: isSettingPassword=${isSettingPassword}, isFirstParticipant=${isFirstParticipant}, isOriginalHostReconnecting=${isOriginalHostReconnecting}, canReclaimHost=${canReclaimHost}`);
        }
      }
    }
    
    // ULTRA STRICT: Only allow host if:
    // 1. This socket ID matches the existing hostId (reconnecting host, same socket), OR
    // 2. Host disconnected and username matches (reconnecting host, new socket), OR
    // 3. There is NO hostId at all AND this is the first participant (meeting just started)
    // IGNORE frontend isHost value completely - backend is the source of truth
    // CRITICAL: Password check blocks host status
    let finalIsActuallyHost = !passwordBlocksHost && (isOriginalHostReconnecting || isHostReconnectingByUsername || isFirstParticipant);
    
    // CRITICAL: Final security check - if hostId exists and host socket IS connected, 
    // only that socket can be host (unless it's the same username reconnecting)
    if (hasExistingHost && hostSocketConnected && meeting.hostId !== socket.id) {
      // There's already a connected host and it's not this user - cannot be host
      if (finalIsActuallyHost) {
        console.error(`⚠️ SECURITY: Attempted to become host when host is connected: ${meeting.hostId}, current socket: ${socket.id}, userName: ${userName}`);
      }
      // Force to false - this is the most important check
      finalIsActuallyHost = false;
    }
    
    // ADDITIONAL SECURITY: If hostId exists (even if disconnected), only allow host if:
    // 1. Socket ID matches hostId, OR
    // 2. Username matches and no active participants (reconnection scenario)
    // This prevents new participants from becoming host when host exists
    if (hasExistingHost && !isOriginalHostReconnecting && !isHostReconnectingByUsername) {
      // Host exists and this is NOT the host reconnecting - must be participant
      if (finalIsActuallyHost) {
        console.error(`⚠️ SECURITY: Attempted to become host when host exists: ${meeting.hostId}, current socket: ${socket.id}, userName: ${userName}`);
      }
      finalIsActuallyHost = false;
    }
    
    // Additional logging for debugging
    console.log(`🔍 Host determination for ${userName} (${socket.id}):`, {
      hasExistingHost,
      existingHostId: meeting.hostId,
      hostSocketConnected,
      isOriginalHostReconnecting,
      isHostReconnectingByUsername,
      isFirstParticipant,
      participantsCountBeforeFilter: participantsBeforeFilter,
      participantsCountAfterFilter: meeting.participants.length,
      hasAnyHostParticipant,
      meetingHasPassword: !!(meeting && meeting.password && meeting.password.trim() !== ''),
      userProvidedPassword: !!(password && password.trim() !== ''),
      passwordBlocksHost,
      finalIsActuallyHost,
      setPassword: !!setPassword
    });
    
    // CRITICAL: Remove any existing participants with the same name (without "(Host)" suffix)
    // This prevents duplicates when the same user joins from multiple tabs
    const baseName = userName.replace(' (Host)', '');
    meeting.participants = meeting.participants.filter(p => {
      const pBaseName = p.name.replace(' (Host)', '');
      return pBaseName !== baseName;
    });
    
    // PASSWORD VERIFICATION: Check password for participants
    // CRITICAL: Host who SETS password should NOT be asked for password
    // Only participants need to verify password
    // CRITICAL: Check isHostSettingPassword FIRST before any password verification
    if (meeting && meeting.password && meeting.password.trim() !== '') {
      // CRITICAL: If user is SETTING password (setPassword !== undefined), they ARE the host
      // Skip ALL password verification for them, regardless of finalIsActuallyHost status
      // This check MUST happen FIRST, before any password verification logic
      console.log(`🔍 Password verification check for ${userName} (${socket.id}):`, {
        meetingHasPassword: !!(meeting && meeting.password && meeting.password.trim() !== ''),
        isHostSettingPassword: isHostSettingPassword,
        setPasswordValue: setPassword !== undefined ? (setPassword || 'null/empty') : 'undefined',
        finalIsActuallyHost: finalIsActuallyHost,
        meetingHostId: meeting.hostId
      });
      
      if (isHostSettingPassword) {
        console.log(`👑✅ User is setting password - they are the host, skipping ALL password verification. User: ${userName} (${socket.id}), setPassword: ${setPassword !== undefined ? (setPassword || 'null/empty') : 'undefined'}`);
        // Ensure they're marked as host
        if (!finalIsActuallyHost) {
          finalIsActuallyHost = true;
          console.log(`✅ Forcing host status for user setting password. User: ${userName} (${socket.id})`);
        }
        // Skip password verification entirely for host setting password
        console.log(`🔓 Host setting password - no password verification needed, proceeding to join as host`);
        // CRITICAL: Skip the entire password verification block for host
        // Don't check password, just proceed to join as host
      } else {
        // User is NOT setting password - they need to verify if they're a participant
        const isSettingPassword = false; // Not setting password
        
        console.log(`🔒 Password verification for ${userName} (${socket.id}):`, {
          hasPassword: !!meeting.password,
          isHost: finalIsActuallyHost,
          providedPassword: password ? 'yes' : 'no',
          isSettingPassword: isSettingPassword,
          meetingPassword: meeting.password,
          hasExistingHost,
          existingHostId: meeting.hostId,
          passwordBlocksHost
        });
        // User is NOT setting password - check if they need to verify
        // CRITICAL: If password blocks host, user MUST be participant
        if (passwordBlocksHost) {
          finalIsActuallyHost = false;
          console.log(`🔒 Password blocks host - forcing participant status. User: ${userName} (${socket.id})`);
        }
        
        // CRITICAL: Only skip password check if user is ACTUALLY the host
        // Double-check: if hostId exists and doesn't match this socket, force participant status
        if (hasExistingHost && meeting.hostId !== socket.id) {
          // Host exists and it's not this user - must be participant, require password
          finalIsActuallyHost = false;
          console.log(`🔒 Forcing participant status - host exists: ${meeting.hostId}, current socket: ${socket.id}`);
        }
        
        // EXTRA SECURITY: If password is provided (meaning user went through password verification),
        // they CANNOT be the host - only participants need to verify password
        if (password && password.trim() !== '') {
          // User provided password = they're a participant, not host
          if (finalIsActuallyHost) {
            console.error(`⚠️ SECURITY: User provided password but was marked as host - forcing participant status. User: ${userName} (${socket.id}), HostId: ${meeting.hostId}`);
          }
          finalIsActuallyHost = false;
        }
        
        // CRITICAL: Check password for ALL non-host users
        // This includes users who might have been incorrectly marked as host
        if (!finalIsActuallyHost || passwordBlocksHost) {
          // Participant needs to provide password
          if (!password || password.trim() !== meeting.password.trim()) {
            console.log(`🔒 Password required for participant ${userName} (${socket.id}) - emitting meeting-password-required`);
            socket.emit('meeting-password-required', {
              meetingId: meetingId,
              error: password ? 'Incorrect password. Please try again.' : 'This meeting requires a password.'
            });
            return; // Don't add participant, wait for correct password
          }
          
          // Password is correct
          console.log(`✅ Password verified for participant ${userName} (${socket.id})`);
          // CRITICAL: Ensure finalIsActuallyHost is false after password verification
          finalIsActuallyHost = false;
        } else {
          // Host doesn't need password (they set it)
          console.log(`👑 Host ${userName} (${socket.id}) joining - password not required`);
        }
      }
    } else {
      console.log(`🔓 No password required for ${userName} (${socket.id}) - meeting has no password`);
    }
    
    // FINAL SECURITY CHECK: If password was provided (for verification), user CANNOT be host
    // EXCEPTION: If user is SETTING password (setPassword), they ARE the host
    // This is a double-check to ensure participant status is maintained
    const isSettingPasswordFinal = setPassword !== undefined; // Host is setting password (even if null/empty)
    if (password && password.trim() !== '' && finalIsActuallyHost && !isSettingPasswordFinal) {
      console.error(`🚨 CRITICAL SECURITY: Password was provided but finalIsActuallyHost is still true! Forcing to false. User: ${userName} (${socket.id})`);
      finalIsActuallyHost = false;
    }
    
    // FINAL CHECK: If hostId exists and doesn't match this socket, user cannot be host
    // EXCEPTION: If user is setting password, they might be creating the meeting (no hostId yet)
    if (meeting.hostId && meeting.hostId !== socket.id && finalIsActuallyHost && !isSettingPasswordFinal) {
      console.error(`🚨 CRITICAL SECURITY: HostId exists (${meeting.hostId}) but user is marked as host! Forcing to false. User: ${userName} (${socket.id})`);
      finalIsActuallyHost = false;
    }
    
    console.log(`🎯 FINAL Host determination for ${userName} (${socket.id}):`, {
      finalIsActuallyHost,
      meetingHostId: meeting.hostId,
      providedPassword: password ? 'yes' : 'no',
      isSettingPassword: isSettingPasswordFinal,
      meetingHasPassword: !!(meeting.password && meeting.password.trim() !== '')
    });
    
    // ABSOLUTE FINAL CHECK: If password was provided (for verification), user CANNOT be host
    // EXCEPTION: If user is SETTING password, they ARE the host
    // This is the last check before creating participant object
    let participantIsHost = finalIsActuallyHost;
    
    // CRITICAL: If user is SETTING password, they ARE the host - this takes priority over everything
    if (isHostSettingPassword) {
      participantIsHost = true;
      finalIsActuallyHost = true;
      console.log(`👑 CRITICAL: User is setting password - forcing participantIsHost to true. User: ${userName} (${socket.id})`);
    }
    
    // CRITICAL: If password was provided (for verification), user is ALWAYS a participant
    // But if user is SETTING password, they ARE the host (already handled above)
    if (password && password.trim() !== '' && !isSettingPasswordFinal && !isHostSettingPassword) {
      // Password was provided for verification = user is participant, not host
      participantIsHost = false;
      if (finalIsActuallyHost) {
        console.error(`🚨 ABSOLUTE FINAL CHECK: Password provided but finalIsActuallyHost is true! Forcing participantIsHost to false. User: ${userName} (${socket.id})`);
      }
      console.log(`🔒 ABSOLUTE FINAL: Password provided - participantIsHost forced to false for ${userName} (${socket.id})`);
    }
    
    // CRITICAL: If hostId exists and doesn't match, user CANNOT be host
    // EXCEPTION: If user is SETTING password, they ARE the host (already handled above)
    // This check must happen regardless of password
    if (meeting.hostId && meeting.hostId !== socket.id && !isHostSettingPassword) {
      participantIsHost = false;
      if (finalIsActuallyHost || participantIsHost) {
        console.error(`🚨 ABSOLUTE FINAL CHECK: HostId exists (${meeting.hostId}) but user is marked as host! Forcing participantIsHost to false. User: ${userName} (${socket.id})`);
      }
      console.log(`🔒 ABSOLUTE FINAL: HostId exists (${meeting.hostId}) - participantIsHost forced to false for ${userName} (${socket.id})`);
    }
    
    // EXTRA CRITICAL: If meeting has password and user provided it, they CANNOT be host
    // EXCEPTION: If user is SETTING password, they ARE the host (already handled above)
    // This is a triple-check to ensure security
    if (meeting.password && meeting.password.trim() !== '' && password && password.trim() !== '' && !isHostSettingPassword) {
      participantIsHost = false;
      console.log(`🔒 TRIPLE CHECK: Meeting has password and user provided it - participantIsHost forced to false for ${userName} (${socket.id})`);
    }
    
    console.log(`👤 Creating participant object for ${userName} (${socket.id}):`, {
      participantIsHost,
      finalIsActuallyHost,
      providedPassword: password ? 'yes' : 'no',
      meetingHostId: meeting.hostId
    });
    
    const participant = {
      id: socket.id,
      name: participantIsHost ? `${userName} (Host)` : userName,
      joinedAt: new Date(),
      isHost: participantIsHost, // CRITICAL: Use participantIsHost, not finalIsActuallyHost
      isApproved: participantIsHost ? true : (password && password.trim() !== '' ? true : false) // Participants who verified password are approved
    };
    
    // Add participant directly (no approval needed)
    meeting.participants.push(participant);
    
    
    // If this user is the host, set them as host BEFORE emitting events
    // CRITICAL: Use participantIsHost, not finalIsActuallyHost
    // ALSO: If user is setting password, they ARE the host (even if participantIsHost is false due to security checks)
    if (participantIsHost || isHostSettingPassword) {
      meeting.host = `${userName} (Host)`;
      meeting.hostId = socket.id; // CRITICAL: Set hostId BEFORE emitting meeting-joined
      
      // CRITICAL: Ensure only one host exists in participants array
      meeting.participants.forEach(p => {
        if (p.id !== socket.id && p.isHost) {
          p.isHost = false;
          p.name = p.name.replace(' (Host)', '');
        }
      });
      
      // CRITICAL: If user is setting password, ensure they're marked as host in participant object
      if (isHostSettingPassword) {
        // Update the participant object in the array
        const participantIndex = meeting.participants.findIndex(p => p.id === socket.id);
        if (participantIndex !== -1) {
          meeting.participants[participantIndex].isHost = true;
          meeting.participants[participantIndex].name = `${userName} (Host)`;
        }
        participant.isHost = true;
        participant.name = `${userName} (Host)`;
        console.log(`👑 Ensuring host status for user setting password. User: ${userName} (${socket.id}), hostId: ${socket.id}`);
      }
      
      // Initialize AI features for this meeting
      llmService.reinitializeForMeeting(meetingId).then((aiAvailable) => {
        if (aiAvailable) {
          // Notify host that AI is ready
          socket.emit('ai_status', {
            meetingId,
            status: 'ready',
            message: 'AI-powered features are active'
          });
        } else {
          // Notify host that AI is limited
          socket.emit('ai_status', {
            meetingId,
            status: 'limited',
            message: 'AI features are limited (using basic mode)'
          });
        }
      }).catch((error) => {
        console.error(`Failed to initialize AI for meeting ${meetingId}:`, error);
        // Even on error, emit ready status since we have fallback
        socket.emit('ai_status', {
          meetingId,
          status: 'ready',
          message: 'AI-powered features are active (fallback mode)'
        });
      });
    }
    
    socket.join(meetingId);
    
    // Update all participants with the latest meeting state
    const updatedMeeting = activeMeetings.get(meetingId);
    
    console.log(`🔍 Before cleanup - Meeting participants:`, {
      meetingId: meetingId,
      hostId: updatedMeeting.hostId,
      host: updatedMeeting.host,
      participantsCount: updatedMeeting.participants.length,
      participants: updatedMeeting.participants.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
    });
    
    // CRITICAL: Clean up participants array to remove duplicates before sending to client
    // BUT: Always keep the host in the list, even if there are duplicates
    const uniqueParticipants = [];
    const seenNames = new Set();
    
    updatedMeeting.participants.forEach(p => {
      const baseName = p.name.replace(' (Host)', '');
      if (!seenNames.has(baseName)) {
        seenNames.add(baseName);
        uniqueParticipants.push(p);
      } else {
        // If duplicate found, keep the one with the current socket ID or the host
        const existingIndex = uniqueParticipants.findIndex(up => {
          const upBaseName = up.name.replace(' (Host)', '');
          return upBaseName === baseName;
        });
        if (existingIndex !== -1) {
          const existing = uniqueParticipants[existingIndex];
          // CRITICAL: Always keep the host, or the one with the current socket ID
          if (p.isHost || p.id === socket.id) {
            uniqueParticipants[existingIndex] = p;
          }
        }
      }
    });
    
    // CRITICAL: Ensure host is always in the participants list
    // If hostId exists but host is not in participants, add them
    // ALSO: If hostId is null but there's a host in participants, set the hostId
    if (updatedMeeting.hostId) {
      const hostInList = uniqueParticipants.find(p => p.id === updatedMeeting.hostId);
      if (!hostInList) {
        console.log(`⚠️ Host ${updatedMeeting.hostId} not in participants list, searching for them...`);
        // First, check in the original participants array
        const hostParticipant = updatedMeeting.participants.find(p => p.id === updatedMeeting.hostId);
        if (hostParticipant) {
          console.log(`✅ Found host in original participants array, adding to unique list`);
          uniqueParticipants.push(hostParticipant);
        } else {
          // Host is not in participants array - check if they're in the socket room
          const room = io.sockets.adapter.rooms.get(meetingId);
          const hostInRoom = room && room.has(updatedMeeting.hostId);
          
          if (hostInRoom) {
            // Host is in the room but not in participants - add them
            const hostName = updatedMeeting.host || 'Host';
            console.log(`✅ Host ${updatedMeeting.hostId} is in room but not in participants, adding them`);
            uniqueParticipants.push({
              id: updatedMeeting.hostId,
              name: hostName.includes('(Host)') ? hostName : `${hostName} (Host)`,
              joinedAt: new Date(),
              isHost: true
            });
          } else {
            // Host is not in room either - they might have disconnected
            // But if hostId exists, we should still include them so participant can try to connect
            const hostName = updatedMeeting.host || 'Host';
            console.log(`⚠️ Host ${updatedMeeting.hostId} not found in participants array or room, creating host entry anyway`);
            uniqueParticipants.push({
              id: updatedMeeting.hostId,
              name: hostName.includes('(Host)') ? hostName : `${hostName} (Host)`,
              joinedAt: new Date(),
              isHost: true
            });
          }
        }
      } else {
        // Host is in list, ensure they're marked as host
        if (!hostInList.isHost) {
          console.log(`⚠️ Host ${updatedMeeting.hostId} in list but not marked as host, fixing...`);
          hostInList.isHost = true;
          hostInList.name = hostInList.name.includes('(Host)') ? hostInList.name : `${hostInList.name} (Host)`;
        }
      }
    }
    
    // CRITICAL: If hostId is null but there's a host in participants, set the hostId
    // This can happen if the host set the password but the hostId was cleared somehow
    if (!updatedMeeting.hostId) {
      const hostParticipant = uniqueParticipants.find(p => p.isHost);
      if (hostParticipant) {
        console.log(`⚠️ HostId is null but found host in participants: ${hostParticipant.id}, setting hostId`);
        updatedMeeting.hostId = hostParticipant.id;
        updatedMeeting.host = hostParticipant.name;
      } else {
        // Also check in the original participants array
        const hostParticipantOriginal = updatedMeeting.participants.find(p => p.isHost);
        if (hostParticipantOriginal) {
          console.log(`⚠️ HostId is null but found host in original participants: ${hostParticipantOriginal.id}, setting hostId`);
          updatedMeeting.hostId = hostParticipantOriginal.id;
          updatedMeeting.host = hostParticipantOriginal.name;
          // Add to unique participants if not already there
          if (!uniqueParticipants.find(p => p.id === hostParticipantOriginal.id)) {
            uniqueParticipants.push(hostParticipantOriginal);
          }
        } else {
          // CRITICAL: If meeting has a password, there MUST be a host
          // If hostId is null and no host in participants, check if there are other participants
          // The first participant (or any participant) might be the host who disconnected/reconnected
          if (updatedMeeting.password) {
            console.log(`⚠️ Meeting has password but hostId is null and no host in participants. Checking for potential host...`);
            // Check if there are any other participants in the meeting (excluding the current joining participant)
            const otherParticipants = updatedMeeting.participants.filter(p => p.id !== socket.id);
            if (otherParticipants.length > 0) {
              // The first other participant might be the host
              const potentialHost = otherParticipants[0];
              console.log(`⚠️ Found potential host: ${potentialHost.id} (${potentialHost.name}), setting as host`);
              updatedMeeting.hostId = potentialHost.id;
              updatedMeeting.host = potentialHost.name.includes('(Host)') ? potentialHost.name : `${potentialHost.name} (Host)`;
              // Mark them as host in the participants array
              potentialHost.isHost = true;
              potentialHost.name = updatedMeeting.host;
              // Ensure they're in uniqueParticipants
              const existingIndex = uniqueParticipants.findIndex(p => p.id === potentialHost.id);
              if (existingIndex !== -1) {
                uniqueParticipants[existingIndex] = potentialHost;
              } else {
                uniqueParticipants.push(potentialHost);
              }
            } else {
              // CRITICAL: Check socket.io room for connected sockets
              // If there are other sockets in the room, one of them might be the host
              const room = io.sockets.adapter.rooms.get(meetingId);
              if (room && room.size > 1) {
                console.log(`⚠️ No host in participants but ${room.size} sockets in room. Checking for host...`);
                // Get all socket IDs in the room (excluding current socket)
                const roomSocketIds = Array.from(room).filter(id => id !== socket.id);
                if (roomSocketIds.length > 0) {
                  // Check if any of these sockets are in the participants array
                  const roomParticipants = updatedMeeting.participants.filter(p => roomSocketIds.includes(p.id));
                  if (roomParticipants.length > 0) {
                    // The first participant in the room might be the host
                    const potentialHost = roomParticipants[0];
                    console.log(`⚠️ Found potential host from room: ${potentialHost.id} (${potentialHost.name}), setting as host`);
                    updatedMeeting.hostId = potentialHost.id;
                    updatedMeeting.host = potentialHost.name.includes('(Host)') ? potentialHost.name : `${potentialHost.name} (Host)`;
                    potentialHost.isHost = true;
                    potentialHost.name = updatedMeeting.host;
                    const existingIndex = uniqueParticipants.findIndex(p => p.id === potentialHost.id);
                    if (existingIndex !== -1) {
                      uniqueParticipants[existingIndex] = potentialHost;
                    } else {
                      uniqueParticipants.push(potentialHost);
                    }
                  } else {
                    // No participants in room match, but there are sockets
                    // Create a host entry from the first socket in the room
                    const hostSocketId = roomSocketIds[0];
                    console.log(`⚠️ Creating host entry from room socket: ${hostSocketId}`);
                    const hostParticipant = {
                      id: hostSocketId,
                      name: 'Host',
                      joinedAt: new Date(),
                      isHost: true
                    };
                    updatedMeeting.hostId = hostSocketId;
                    updatedMeeting.host = 'Host';
                    uniqueParticipants.push(hostParticipant);
                  }
                }
              }
            }
          }
        }
      }
    }
    
    // Update the meeting's participants array with cleaned version
    updatedMeeting.participants = uniqueParticipants;
    
    console.log(`🔍 After cleanup - Meeting participants:`, {
      meetingId: meetingId,
      hostId: updatedMeeting.hostId,
      host: updatedMeeting.host,
      participantsCount: uniqueParticipants.length,
      participants: uniqueParticipants.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
    });
    
    // Notify others in the meeting with updated participant list (only if there are other participants)
    if (uniqueParticipants.length > 1) {
      socket.to(meetingId).emit('participant-joined', { 
        participant, 
        meeting: {
          ...updatedMeeting,
          participants: uniqueParticipants
        }
      });
    }
    
    // Send meeting info to the new participant (including all participants)
    // CRITICAL: Ensure hostId is included in the meeting object
    const meetingForClient = {
      ...updatedMeeting,
      participants: uniqueParticipants, // Include cleaned participants
      hostId: updatedMeeting.hostId, // CRITICAL: Explicitly include hostId
      host: updatedMeeting.host // Include host name
    };
    
    // CRITICAL: Final check - if hostId is still null but meeting has password, try to find host from room
    if (!meetingForClient.hostId && meetingForClient.password) {
      console.log(`🚨 CRITICAL: hostId is null but meeting has password. Checking socket.io room for host...`);
      const room = io.sockets.adapter.rooms.get(meetingId);
      if (room && room.size > 1) {
        const roomSocketIds = Array.from(room).filter(id => id !== socket.id);
        console.log(`🔍 Found ${roomSocketIds.length} other sockets in room:`, roomSocketIds);
        // Check if any of these sockets are in the participants array
        const roomParticipants = meetingForClient.participants.filter(p => roomSocketIds.includes(p.id));
        if (roomParticipants.length > 0) {
          // Use the first participant in the room as the host
          const potentialHost = roomParticipants[0];
          console.log(`✅ Setting host from room participant: ${potentialHost.id} (${potentialHost.name})`);
          meetingForClient.hostId = potentialHost.id;
          meetingForClient.host = potentialHost.name.includes('(Host)') ? potentialHost.name : `${potentialHost.name} (Host)`;
          // Update the participant in the array
          const hostIndex = meetingForClient.participants.findIndex(p => p.id === potentialHost.id);
          if (hostIndex !== -1) {
            meetingForClient.participants[hostIndex].isHost = true;
            meetingForClient.participants[hostIndex].name = meetingForClient.host;
          }
        } else {
          // No participants match, but there are sockets in the room
          // Use the first socket as the host
          const hostSocketId = roomSocketIds[0];
          console.log(`⚠️ Creating host entry from room socket (no participant match): ${hostSocketId}`);
          meetingForClient.hostId = hostSocketId;
          meetingForClient.host = 'Host';
          meetingForClient.participants.push({
            id: hostSocketId,
            name: 'Host',
            joinedAt: new Date(),
            isHost: true
          });
        }
      }
    }
    
    console.log(`📤 Sending meeting-joined with meeting data:`, {
      meetingId: meetingForClient.id,
      hostId: meetingForClient.hostId,
      host: meetingForClient.host,
      participantsCount: meetingForClient.participants.length,
      participants: meetingForClient.participants.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
    });
    
    // CRITICAL: Final check before sending - if meeting has password but hostId is still null,
    // and there are other sockets in the room, one of them must be the host
    if (!meetingForClient.hostId && meetingForClient.password) {
      const room = io.sockets.adapter.rooms.get(meetingId);
      if (room && room.size > 1) {
        const roomSocketIds = Array.from(room).filter(id => id !== socket.id);
        console.log(`🚨 FINAL CHECK: hostId is null but ${room.size} sockets in room. Room socket IDs:`, roomSocketIds);
        // If there's only one other socket, it's likely the host
        if (roomSocketIds.length === 1) {
          const likelyHostId = roomSocketIds[0];
          console.log(`✅ Assuming single other socket is host: ${likelyHostId}`);
          meetingForClient.hostId = likelyHostId;
          meetingForClient.host = 'Host';
          // Add host to participants if not already there
          if (!meetingForClient.participants.find(p => p.id === likelyHostId)) {
            meetingForClient.participants.push({
              id: likelyHostId,
              name: 'Host',
              joinedAt: new Date(),
              isHost: true
            });
          }
        }
      }
    }
    
    // CRITICAL: Send correct host status - use participantIsHost, not finalIsActuallyHost or participant.isHost
    // This ensures the frontend gets the correct host status even if there was any confusion
    socket.emit('meeting-joined', { 
      meeting: meetingForClient, 
      participantId: socket.id,
      isHost: participantIsHost // Use participantIsHost which has all security checks applied
    });
    
    console.log(`📤 Meeting-joined event sent:`, {
      socketId: socket.id,
      userName: userName,
      isHost: participantIsHost,
      finalIsActuallyHost: finalIsActuallyHost,
      meetingHostId: meetingForClient.hostId, // Use meetingForClient.hostId, not meeting.hostId
      participantsCount: meetingForClient.participants.length,
      participantIsHost: participant.isHost,
      providedPassword: password ? 'yes' : 'no'
    });

    // If this is the host, update the hostId in case they reconnected
    // CRITICAL: Only update if they're actually the host (use participantIsHost)
    if (participantIsHost) {
      meeting.hostId = socket.id;
      console.log(`✅ Host confirmed: ${userName} (${socket.id}) is the host for meeting ${meetingId}`);
    }
  });

  // Handle set meeting password (host only)
  socket.on('set-meeting-password', ({ meetingId, password }) => {
    const meeting = activeMeetings.get(meetingId);
    if (!meeting) {
      socket.emit('meeting-password-error', {
        meetingId,
        error: 'Meeting not found'
      });
      return;
    }

    // Verify requester is host
    if (meeting.hostId !== socket.id) {
      socket.emit('meeting-password-error', {
        meetingId,
        error: 'Only host can set meeting password'
      });
      return;
    }

    // Set or remove password
    meeting.password = password && password.trim() !== '' ? password.trim() : null;
    
    console.log(`🔒 Meeting password ${meeting.password ? 'set' : 'removed'} for meeting ${meetingId} by host ${socket.id}`);
    
    socket.emit('meeting-password-set', {
      meetingId,
      success: true,
      message: meeting.password ? 'Password set successfully' : 'Password removed successfully'
    });
  });

  // Handle verify meeting password (for participants)
  socket.on('verify-meeting-password', ({ meetingId, password }) => {
    const meeting = activeMeetings.get(meetingId);
    if (!meeting) {
      socket.emit('meeting-password-error', {
        meetingId,
        error: 'Meeting not found'
      });
      return;
    }

    // Check if meeting has password
    if (!meeting.password || meeting.password.trim() === '') {
      socket.emit('meeting-password-verified', {
        meetingId
      });
      return;
    }

    // Verify password
    if (!password || password.trim() !== meeting.password.trim()) {
      socket.emit('meeting-password-error', {
        meetingId,
        error: 'Incorrect password. Please try again.'
      });
      return;
    }

    // Password is correct - allow join
    socket.emit('meeting-password-verified', {
      meetingId
    });
    
    console.log(`✅ Password verified for ${socket.id} in meeting ${meetingId}`);
    
    // Retry join-meeting with verified password
    // The join-meeting handler will now allow the user to join
  });

  // Handle new participant joining - notify existing participants
  socket.on('participant-ready', ({ meetingId, participantId }) => {
    console.log(`🎯 Participant ${participantId} ready in meeting ${meetingId}`);
    
    // Find the meeting and participant
    const meeting = activeMeetings.get(meetingId);
    if (meeting) {
      const participant = meeting.participants.find(p => p.id === participantId);
      // Notify all participants
      if (participant) {
        console.log(`👤 ${participant.name} (${participantId}) is ready for WebRTC connections`);
        console.log(`📊 Total participants in meeting: ${meeting.participants.length}`);
        console.log(`📊 Forwarding participant-ready to meeting room: ${meetingId}`);
        console.log(`📊 Meeting participants:`, meeting.participants.map(p => ({ name: p.name, id: p.id })));
        
        // Forward the event to ALL other participants (multi-participant support)
        const otherParticipants = meeting.participants.filter(p => 
          p.id !== participantId
        );
        console.log(`📤 MULTI-PARTICIPANT: Participant ${participant.name} is ready, notifying ${otherParticipants.length} other participants`);
        console.log(`📤 MULTI-PARTICIPANT: Other participants:`, otherParticipants.map(p => ({ id: p.id, name: p.name })));
        
        otherParticipants.forEach(otherParticipant => {
          console.log(`📤 MULTI-PARTICIPANT: Notifying ${otherParticipant.name} (${otherParticipant.id}) that ${participant.name} is ready`);
          socket.to(otherParticipant.id).emit('participant-ready', { 
            participantId, 
            participantName: participant.name 
          });
        });
          
        console.log(`📤 MULTI-PARTICIPANT: Emitted participant-ready to ${otherParticipants.length} participants`);
      } else {
        console.log(`❌ Participant ${participantId} not found or not approved in meeting ${meetingId}`);
      }
    } else {
      console.log(`❌ Meeting ${meetingId} not found`);
    }
  });

  // Handle participant removal by host
  socket.on('remove-participant', ({ meetingId, participantId }) => {
    console.log(`🗑️ Host ${socket.id} requesting to remove participant ${participantId} from meeting ${meetingId}`);
    const meeting = activeMeetings.get(meetingId);
    
    console.log(`🗑️ DEBUG: Current meeting state before removal:`, {
      meetingId,
      hostId: meeting?.hostId,
      participants: meeting?.participants?.map(p => ({ id: p.id, name: p.name, isHost: p.isHost })),
      requesterSocketId: socket.id
    });
    if (!meeting) {
      console.log(`❌ Meeting ${meetingId} not found`);
      return;
    }
    
    // Check if the requester is the host
    if (meeting.hostId !== socket.id) {
      console.log(`❌ Only host can remove participants. Requester: ${socket.id}, Host: ${meeting.hostId}`);
      return;
    }
    
    // Find the participant to remove
    const participantIndex = meeting.participants.findIndex(p => p.id === participantId);
    if (participantIndex === -1) {
      console.log(`❌ Participant ${participantId} not found in meeting ${meetingId}`);
      console.log(`❌ Available participants:`, meeting.participants.map(p => ({ id: p.id, name: p.name })));
      return;
    }
    
    const participant = meeting.participants[participantIndex];
    console.log(`🗑️ Removing participant: ${participant.name} (${participantId})`);
    
    // Remove participant from meeting
    meeting.participants.splice(participantIndex, 1);
    
    // Remove from pending approvals if exists
    if (meeting.pendingApprovals) {
      meeting.pendingApprovals = meeting.pendingApprovals.filter(p => p.id !== participantId);
    }
    
    // Notify the removed participant
    console.log(`🗑️ DEBUG: Notifying removed participant ${participantId}`);
    socket.to(participantId).emit('participant-removed', {
      message: 'You have been removed from the meeting by the host',
      meetingId,
      hostName: meeting.host
    });
    
    // Notify all remaining participants (including the host who initiated the removal)
    console.log(`🗑️ DEBUG: Notifying all participants in meeting ${meetingId} about removal`);
    console.log(`🗑️ DEBUG: Remaining participants:`, meeting.participants.map(p => ({ id: p.id, name: p.name })));
    console.log(`🗑️ DEBUG: Emitting participant-left event to meeting room ${meetingId}`);
    console.log(`🗑️ DEBUG: Event data:`, {
      participantId,
      participantName: participant.name,
      reason: 'removed by host'
    });
    
    // Emit to ALL participants in the meeting room (including the host)
    io.to(meetingId).emit('participant-left', {
      participantId,
      participantName: participant.name,
      reason: 'removed by host'
    });
    
    console.log(`🗑️ DEBUG: participant-left event emitted to meeting room ${meetingId} (including host)`);
    
    // Update meeting state
    activeMeetings.set(meetingId, meeting);
    
    console.log(`✅ Participant ${participant.name} removed successfully. Remaining participants: ${meeting.participants.length}`);
    console.log(`✅ DEBUG: Final meeting state:`, {
      meetingId,
      participants: meeting.participants.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
    });
  });

  // Handle participant leaving
  socket.on('leave-meeting', ({ meetingId, userName }) => {
    const meeting = activeMeetings.get(meetingId);
    if (meeting) {
      const leavingParticipant = meeting.participants.find(p => p.id === socket.id);
      meeting.participants = meeting.participants.filter(p => p.id !== socket.id);
      
      // If host is leaving and there are other participants, transfer host role
      if (leavingParticipant && leavingParticipant.isHost && meeting.participants.length > 0) {
        const newHost = meeting.participants[0];
        newHost.isHost = true;
        meeting.host = newHost.name;
        meeting.hostId = newHost.id;
        
        // Notify all participants about host change
        io.to(meetingId).emit('host-changed', {
          newHost: newHost.name,
          newHostId: newHost.id
        });
        
        console.log(`Host transferred from ${userName} to ${newHost.name} in meeting ${meetingId}`);
      }
      
      if (meeting.participants.length === 0) {
        // Only remove meeting if there are no pending approvals either
        const hasPendingApprovals = meeting.pendingApprovals && meeting.pendingApprovals.length > 0;
        
        if (!hasPendingApprovals) {
          
          // Keep meeting alive for 5 minutes to allow participants to join
          console.log(`Meeting ${meetingId} will be deleted in 5 minutes - no participants and no pending approvals`);
          setTimeout(() => {
            const currentMeeting = activeMeetings.get(meetingId);
            if (currentMeeting && currentMeeting.participants.length === 0) {
              activeMeetings.delete(meetingId);
              console.log(`Meeting ${meetingId} ended after 5 minutes - no participants and no pending approvals`);
            }
          }, 300000); // 5 minutes instead of 30 seconds
        } else {
          console.log(`Meeting ${meetingId} kept alive - has ${meeting.pendingApprovals.length} pending approvals`);
        }
      }
    }
    
    socket.to(meetingId).emit('participant-left', { 
      participantId: socket.id, 
      userName 
    });
    
    socket.leave(meetingId);
    console.log(`${userName} left meeting ${meetingId}`);
  });
}


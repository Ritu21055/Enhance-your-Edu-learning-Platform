/**
 * MeetingNotes Component
 * Displays AI-generated meeting notes with summary, key points, action items, decisions, and conversation transcript
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  List,
  ListItem,
  ListItemText,
  Chip,
  Button,
  Card,
  CardContent,
  Divider,
  CircularProgress,
  Alert
} from '@mui/material';
import {
  ExpandMore,
  Description,
  CheckCircle,
  Gavel,
  School,
  Person,
  Chat,
  Download,
  PictureAsPdf
} from '@mui/icons-material';

const MeetingNotes = ({ notes, loading = false, error = null }) => {
  const [expanded, setExpanded] = useState('summary');

  const handleChange = (panel) => (event, isExpanded) => {
    setExpanded(isExpanded ? panel : false);
  };

  const handleDownload = (format = 'pdf') => {
    if (!notes) return;

    if (format === 'pdf') {
      handleDownloadPDF();
    } else {
      const notesText = formatNotesAsText(notes);
      const blob = new Blob([notesText], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meeting-notes-${new Date().toISOString().split('T')[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  const handleDownloadPDF = () => {
    // Use browser print API directly (no jspdf dependency)
    handleDownloadPDFViaPrint();
  };

  const handleDownloadPDFViaPrint = () => {
    // Create a printable HTML document
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to download PDF');
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Meeting Notes</title>
          <style>
            @media print {
              @page {
                margin: 1in;
              }
            }
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            h1 {
              text-align: center;
              color: #333;
              border-bottom: 3px solid #333;
              padding-bottom: 10px;
            }
            h2 {
              color: #555;
              margin-top: 30px;
              border-bottom: 2px solid #ddd;
              padding-bottom: 5px;
            }
            ul {
              margin: 10px 0;
              padding-left: 30px;
            }
            li {
              margin: 5px 0;
            }
            .transcript-entry {
              margin: 10px 0;
              padding: 10px;
              background: #f5f5f5;
              border-left: 3px solid #333;
            }
            .timestamp {
              font-weight: bold;
              color: #666;
            }
            .speaker {
              font-weight: bold;
              color: #333;
            }
          </style>
        </head>
        <body>
          <h1>MEETING NOTES</h1>
          
          ${notes.summary ? `<h2>SUMMARY</h2><p>${notes.summary}</p>` : ''}
          
          ${notes.importantPoints && notes.importantPoints.length > 0 ? `
            <h2>IMPORTANT POINTS</h2>
            <ul>
              ${notes.importantPoints.map((point, index) => `<li>${point}</li>`).join('')}
            </ul>
          ` : ''}
          
          ${notes.actionItems && notes.actionItems.length > 0 ? `
            <h2>ACTION ITEMS</h2>
            <ul>
              ${notes.actionItems.map((item, index) => {
                const itemText = typeof item === 'string' ? item : item.task;
                const assigned = typeof item === 'object' && item.assignedTo ? ` (Assigned to: ${item.assignedTo})` : '';
                const deadline = typeof item === 'object' && item.deadline ? ` (Deadline: ${item.deadline})` : '';
                return `<li>${itemText}${assigned}${deadline}</li>`;
              }).join('')}
            </ul>
          ` : ''}
          
          ${notes.decisions && notes.decisions.length > 0 ? `
            <h2>DECISIONS</h2>
            <ul>
              ${notes.decisions.map((decision, index) => `<li>${decision}</li>`).join('')}
            </ul>
          ` : ''}
          
          ${notes.studyGuide ? `
            ${notes.studyGuide.definitions && notes.studyGuide.definitions.length > 0 ? `
              <h2>DEFINITIONS</h2>
              <ul>
                ${notes.studyGuide.definitions.map((def, index) => `<li>${def}</li>`).join('')}
              </ul>
            ` : ''}
            ${notes.studyGuide.examples && notes.studyGuide.examples.length > 0 ? `
              <h2>EXAMPLES</h2>
              <ul>
                ${notes.studyGuide.examples.map((ex, index) => `<li>${ex}</li>`).join('')}
              </ul>
            ` : ''}
            ${notes.studyGuide.formulas && notes.studyGuide.formulas.length > 0 ? `
              <h2>FORMULAS</h2>
              <ul>
                ${notes.studyGuide.formulas.map((formula, index) => `<li>${formula}</li>`).join('')}
              </ul>
            ` : ''}
          ` : ''}
          
          ${notes.participantContributions && Object.keys(notes.participantContributions).length > 0 ? `
            <h2>PARTICIPANT CONTRIBUTIONS</h2>
            ${Object.entries(notes.participantContributions).map(([name, contributions]) => `
              <h3>${name}</h3>
              <ul>
                ${contributions.map((contribution, index) => `<li>${contribution}</li>`).join('')}
              </ul>
            `).join('')}
          ` : ''}
          
          ${notes.conversationTranscript && notes.conversationTranscript.length > 0 ? `
            <h2>CONVERSATION TRANSCRIPT</h2>
            ${notes.conversationTranscript.map((entry) => `
              <div class="transcript-entry">
                <span class="timestamp">[${entry.timestamp}]</span>
                <span class="speaker"> ${entry.speaker}:</span>
                <p>${entry.text}</p>
              </div>
            `).join('')}
          ` : ''}
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    
    // Wait for content to load, then trigger print dialog (which can save as PDF)
    setTimeout(() => {
      printWindow.print();
      // Optionally close after print
      // printWindow.close();
    }, 250);
  };

  const formatNotesAsText = (notes) => {
    let text = 'MEETING NOTES\n';
    text += '='.repeat(50) + '\n\n';

    if (notes.summary) {
      text += 'SUMMARY\n';
      text += '-'.repeat(50) + '\n';
      text += notes.summary + '\n\n';
    }

    if (notes.importantPoints && notes.importantPoints.length > 0) {
      text += 'IMPORTANT POINTS\n';
      text += '-'.repeat(50) + '\n';
      notes.importantPoints.forEach((point, index) => {
        text += `${index + 1}. ${point}\n`;
      });
      text += '\n';
    }

    if (notes.actionItems && notes.actionItems.length > 0) {
      text += 'ACTION ITEMS\n';
      text += '-'.repeat(50) + '\n';
      notes.actionItems.forEach((item, index) => {
        text += `${index + 1}. ${typeof item === 'string' ? item : item.task}\n`;
        if (typeof item === 'object' && item.assignedTo) {
          text += `   Assigned to: ${item.assignedTo}\n`;
        }
        if (typeof item === 'object' && item.deadline) {
          text += `   Deadline: ${item.deadline}\n`;
        }
      });
      text += '\n';
    }

    if (notes.decisions && notes.decisions.length > 0) {
      text += 'DECISIONS\n';
      text += '-'.repeat(50) + '\n';
      notes.decisions.forEach((decision, index) => {
        text += `${index + 1}. ${decision}\n`;
      });
      text += '\n';
    }

    if (notes.studyGuide) {
      const { definitions, examples, formulas } = notes.studyGuide;
      if (definitions && definitions.length > 0) {
        text += 'DEFINITIONS\n';
        text += '-'.repeat(50) + '\n';
        definitions.forEach((def, index) => {
          text += `${index + 1}. ${def}\n`;
        });
        text += '\n';
      }
      if (examples && examples.length > 0) {
        text += 'EXAMPLES\n';
        text += '-'.repeat(50) + '\n';
        examples.forEach((ex, index) => {
          text += `${index + 1}. ${ex}\n`;
        });
        text += '\n';
      }
      if (formulas && formulas.length > 0) {
        text += 'FORMULAS\n';
        text += '-'.repeat(50) + '\n';
        formulas.forEach((formula, index) => {
          text += `${index + 1}. ${formula}\n`;
        });
        text += '\n';
      }
    }

    if (notes.participantContributions && Object.keys(notes.participantContributions).length > 0) {
      text += 'PARTICIPANT CONTRIBUTIONS\n';
      text += '-'.repeat(50) + '\n';
      Object.entries(notes.participantContributions).forEach(([name, contributions]) => {
        text += `${name}:\n`;
        contributions.forEach((contribution, index) => {
          text += `  ${index + 1}. ${contribution}\n`;
        });
        text += '\n';
      });
    }

    if (notes.conversationTranscript && notes.conversationTranscript.length > 0) {
      text += 'CONVERSATION TRANSCRIPT (Kisne Kya Bola)\n';
      text += '='.repeat(50) + '\n';
      notes.conversationTranscript.forEach((entry) => {
        text += `[${entry.timestamp}] ${entry.speaker}: ${entry.text}\n`;
      });
    }

    return text;
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight={200}>
        <CircularProgress />
        <Typography variant="body1" sx={{ ml: 2 }}>
          Generating meeting notes...
        </Typography>
      </Box>
    );
  }

  if (error) {
    // Check if it's a "not found" type error (info) vs actual error
    const isInfoError = error.includes('No meeting notes available') || 
                        error.includes('not found') ||
                        error.includes('may have ended before');
    
    return (
      <Alert severity={isInfoError ? "info" : "error"} sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  }

  if (!notes) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        No meeting notes available for this meeting. Notes are automatically generated when a meeting ends with transcript data.
      </Alert>
    );
  }

  return (
    <Box sx={{ width: '100%', maxWidth: 1200, mx: 'auto', p: 3 }}>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4" component="h2" gutterBottom>
          Meeting Notes
        </Typography>
        <Box display="flex" gap={1}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<PictureAsPdf />}
            onClick={() => handleDownload('pdf')}
            sx={{ mb: 2 }}
          >
            Download PDF
          </Button>
          <Button
            variant="outlined"
            startIcon={<Download />}
            onClick={() => handleDownload('text')}
            sx={{ mb: 2 }}
          >
            Download Text
          </Button>
        </Box>
      </Box>

      {/* Summary */}
      <Accordion expanded={expanded === 'summary'} onChange={handleChange('summary')}>
        <AccordionSummary expandIcon={<ExpandMore />}>
          <Box display="flex" alignItems="center" gap={1}>
            <Description color="primary" />
            <Typography variant="h6">Summary</Typography>
          </Box>
        </AccordionSummary>
        <AccordionDetails>
          <Typography variant="body1" paragraph>
            {notes.summary || 'No summary available.'}
          </Typography>
        </AccordionDetails>
      </Accordion>

      {/* Important Points */}
      {notes.importantPoints && notes.importantPoints.length > 0 && (
        <Accordion expanded={expanded === 'importantPoints'} onChange={handleChange('importantPoints')}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box display="flex" alignItems="center" gap={1}>
              <Description color="primary" />
              <Typography variant="h6">Important Points</Typography>
              <Chip label={notes.importantPoints.length} size="small" color="primary" />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              {notes.importantPoints.map((point, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={`${index + 1}. ${point}`}
                    primaryTypographyProps={{ variant: 'body1' }}
                  />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Action Items */}
      {notes.actionItems && notes.actionItems.length > 0 && (
        <Accordion expanded={expanded === 'actionItems'} onChange={handleChange('actionItems')}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box display="flex" alignItems="center" gap={1}>
              <CheckCircle color="success" />
              <Typography variant="h6">Action Items</Typography>
              <Chip label={notes.actionItems.length} size="small" color="success" />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              {notes.actionItems.map((item, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={typeof item === 'string' ? item : item.task}
                    secondary={
                      typeof item === 'object' ? (
                        <>
                          {item.assignedTo && `Assigned to: ${item.assignedTo}`}
                          {item.assignedTo && item.deadline && ' • '}
                          {item.deadline && `Deadline: ${item.deadline}`}
                        </>
                      ) : null
                    }
                    primaryTypographyProps={{ variant: 'body1' }}
                  />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Decisions */}
      {notes.decisions && notes.decisions.length > 0 && (
        <Accordion expanded={expanded === 'decisions'} onChange={handleChange('decisions')}>
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box display="flex" alignItems="center" gap={1}>
              <Gavel color="warning" />
              <Typography variant="h6">Decisions</Typography>
              <Chip label={notes.decisions.length} size="small" color="warning" />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <List>
              {notes.decisions.map((decision, index) => (
                <ListItem key={index}>
                  <ListItemText
                    primary={`${index + 1}. ${decision}`}
                    primaryTypographyProps={{ variant: 'body1' }}
                  />
                </ListItem>
              ))}
            </List>
          </AccordionDetails>
        </Accordion>
      )}

      {/* Study Guide */}
      {notes.studyGuide && (
        (notes.studyGuide.definitions?.length > 0 ||
          notes.studyGuide.examples?.length > 0 ||
          notes.studyGuide.formulas?.length > 0) && (
          <Accordion expanded={expanded === 'studyGuide'} onChange={handleChange('studyGuide')}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box display="flex" alignItems="center" gap={1}>
                <School color="info" />
                <Typography variant="h6">Study Guide</Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {notes.studyGuide.definitions && notes.studyGuide.definitions.length > 0 && (
                <Box mb={3}>
                  <Typography variant="h6" gutterBottom>
                    Definitions
                  </Typography>
                  <List>
                    {notes.studyGuide.definitions.map((def, index) => (
                      <ListItem key={index}>
                        <ListItemText
                          primary={def}
                          primaryTypographyProps={{ variant: 'body1' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
              {notes.studyGuide.examples && notes.studyGuide.examples.length > 0 && (
                <Box mb={3}>
                  <Typography variant="h6" gutterBottom>
                    Examples
                  </Typography>
                  <List>
                    {notes.studyGuide.examples.map((ex, index) => (
                      <ListItem key={index}>
                        <ListItemText
                          primary={ex}
                          primaryTypographyProps={{ variant: 'body1' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
              {notes.studyGuide.formulas && notes.studyGuide.formulas.length > 0 && (
                <Box>
                  <Typography variant="h6" gutterBottom>
                    Formulas
                  </Typography>
                  <List>
                    {notes.studyGuide.formulas.map((formula, index) => (
                      <ListItem key={index}>
                        <ListItemText
                          primary={formula}
                          primaryTypographyProps={{ variant: 'body1', sx: { fontFamily: 'monospace' } }}
                        />
                      </ListItem>
                    ))}
                  </List>
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        )
      )}

      {/* Participant Contributions */}
      {notes.participantContributions &&
        Object.keys(notes.participantContributions).length > 0 && (
          <Accordion
            expanded={expanded === 'contributions'}
            onChange={handleChange('contributions')}
          >
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Box display="flex" alignItems="center" gap={1}>
                <Person color="secondary" />
                <Typography variant="h6">Participant Contributions</Typography>
                <Chip
                  label={Object.keys(notes.participantContributions).length}
                  size="small"
                  color="secondary"
                />
              </Box>
            </AccordionSummary>
            <AccordionDetails>
              {Object.entries(notes.participantContributions).map(([name, contributions]) => (
                <Box key={name} mb={2}>
                  <Typography variant="h6" gutterBottom>
                    {name}
                  </Typography>
                  <List>
                    {contributions.map((contribution, index) => (
                      <ListItem key={index}>
                        <ListItemText
                          primary={`${index + 1}. ${contribution}`}
                          primaryTypographyProps={{ variant: 'body2' }}
                        />
                      </ListItem>
                    ))}
                  </List>
                  <Divider sx={{ mt: 1 }} />
                </Box>
              ))}
            </AccordionDetails>
          </Accordion>
        )}

      {/* Conversation Transcript - Kisne Kya Bola */}
      {notes.conversationTranscript && notes.conversationTranscript.length > 0 && (
        <Accordion
          expanded={expanded === 'transcript'}
          onChange={handleChange('transcript')}
        >
          <AccordionSummary expandIcon={<ExpandMore />}>
            <Box display="flex" alignItems="center" gap={1}>
              <Chat color="primary" />
              <Typography variant="h6">Conversation Transcript - Kisne Kya Bola</Typography>
              <Chip label={notes.conversationTranscript.length} size="small" color="primary" />
            </Box>
          </AccordionSummary>
          <AccordionDetails>
            <Box>
              {notes.conversationTranscript.map((entry, index) => (
                <Card key={index} sx={{ mb: 2, backgroundColor: 'rgba(0, 0, 0, 0.02)' }}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                      <Typography variant="subtitle1" fontWeight="bold" color="primary">
                        {entry.speaker}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {entry.timestamp}
                      </Typography>
                    </Box>
                    <Typography variant="body2" color="text.primary">
                      {entry.text}
                    </Typography>
                  </CardContent>
                </Card>
              ))}
            </Box>
          </AccordionDetails>
        </Accordion>
      )}
    </Box>
  );
};

export default MeetingNotes;


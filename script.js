// --- DOM Elements ---
const microphoneButton = document.getElementById('microphoneButton');
const transcriptDisplay = document.getElementById('transcript');
const visualMainElement = document.querySelector('main');

// --- Web Audio API Variables for Visualizer ---
let audioContext;
let analyser;
let mediaStreamSource;
let visualElements;
let visualValueCount;
if (/Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)) {
    // Mobile device detected
    visualValueCount = 16;
} else {
    // Desktop or other device: set bars to nearest multiple of 16 based on screen width
    // For example, 1 bar per 40px of width, minimum 16 bars
    visualValueCount = 32;
}

// --- Web Speech API Variables for STT & TTS ---
let recognition; // SpeechRecognition object for STT

// --- State Management ---
let isListeningForSTT = false; // Is SpeechRecognition active?
let isVisualizerActive = false; // Is the microphone connected for visualizer?
let sttFinalTranscript = ''; // Accumulates final transcript for sending to backend
let sttPauseTimer = null; // Timer to detect pause in speech
const sttPauseDuration = 1500; // 1.5 seconds pause before sending to backend


// --- UI Utility Functions ---

/**
 * Updates the transcription display text, optionally adding a copy button for backend responses.
 * @param {string} text - The transcribed text or status message to display.
 */
function setTranscript(text) {
  // For simple status messages, just display the text.
  const content = `<div class="transcript-text">${text}</div>`;
  transcriptDisplay.innerHTML = content;

  // Auto-scroll to the bottom to show the latest content.
  transcriptDisplay.scrollTop = transcriptDisplay.scrollHeight;
}

/**
 * Toggles the visual state of the microphone button.
 * @param {boolean} active - true if mic is active (listening), false if idle.
 */
function toggleMicButtonState(active) {
  if (active) {
    microphoneButton.classList.add('active'); // Apply active animation
    microphoneButton.textContent = 'stop'; // Change button text to stop
  } else {
    microphoneButton.classList.remove('active'); // Remove active animation
    microphoneButton.textContent = 'start'; // Change button text back to start
  }
}

// --- Text-to-Speech (TTS) Functionality ---
/**
 * Speaks the given text aloud using the Web Speech API.
 * @param {string} text - The text to be spoken.
 */
function speakText(text) {
    if ('speechSynthesis' in window) {
        // Cancel any ongoing speech before starting a new one
        if (speechSynthesis.speaking) {
            speechSynthesis.cancel();
        }

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US'; // Set the language
        utterance.pitch = 1;      // Default pitch
        utterance.rate = 1;       // Default rate

        // Optional: You can choose a specific voice if available
        // const voices = speechSynthesis.getVoices();
        // utterance.voice = voices.find(voice => voice.name === 'Google US English'); // Example voice

        speechSynthesis.speak(utterance);
    } else {
        console.warn("Text-to-Speech not supported in this browser.");
    }
}


// --- Backend API Communication ---

/**
 * Sends the transcribed text to the backend API and displays the response.
 * @param {string} text - The text to send to the backend.
 */
async function sendToBackend(text) {
  if (!text || text.trim() === '') {
    return; // Don't send empty strings
  }

  setTranscript("Thinking..."); // Let the user know something is happening

  try {
    const response = await fetch('https://shaikzo-zo.hf.space/query', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: text,
      }),
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.statusText}`);
    }

    const result = await response.json();
    
    // Assuming the API returns a dictionary with a 'response' key
    if (result && result.response) {
      setTranscript(result.response); // Display the AI's response
      speakText(result.response); // Speak the AI's response
    } else {
        setTranscript("Sorry, I didn't get a valid response.");
        speakText("Sorry, I didn't get a valid response.");
    }

  } catch (error) {
    console.error("Backend API error:", error);
    setTranscript("Sorry, I couldn't connect to the AI.");
    speakText("Sorry, I couldn't connect to the AI.");
  }
}


// --- Audio Visualizer Functions (Bar Graph) ---

/**
 * Creates the initial div elements (bars) for the visualizer.
 */
const createDOMElementsForVisualizer = () => { /* Renamed for clarity */
  // Only clear main and add bars IF the button is currently there,
  // and we want to replace it with bars.
  // This is the core fix to prevent flicker by not re-adding the button constantly.
  if (visualMainElement.contains(microphoneButton)) {
    visualMainElement.removeChild(microphoneButton); // Remove the button
  }
  visualMainElement.innerHTML = ''; // Clear any remaining elements (if any)
  for (let i = 0; i < visualValueCount; ++i) {
    const elm = document.createElement('div');
    visualMainElement.appendChild(elm);
  }
  visualElements = document.querySelectorAll('main div'); // Get references to all created divs
};


/**
 * Processes audio frequency data to update the visualizer bar heights and opacities.
 * @param {Uint8Array} data - The frequency data array.
 */
const processFrameForVisualizer = (data) => { /* Renamed for clarity */
  // Mapping to reorder frequency data for a more visually appealing effect
  const dataMap = {
    15: 0, 16: 1, 14: 2, 17: 3, 13: 4, 18: 5, 12: 6, 19: 7,
    11: 8, 20: 9, 10: 10, 21: 11, 9: 12, 22: 13, 8: 14, 23: 15,
    7: 16, 24: 17, 6: 18, 25: 19, 5: 20, 26: 21, 4: 22, 27: 23,
    3: 24, 28: 25, 2: 26, 29: 27, 1: 28, 30: 29, 0: 30, 31: 31
  };

  const values = Object.values(data);
  for (let i = 0; i < visualValueCount; ++i) {
    // Normalize value (0-1)
    const value = values[dataMap[i]] / 255;

    const elmStyles = visualElements[i].style;
    elmStyles.transform = `scaleY(${value})`; // Scale bar height
    elmStyles.opacity = Math.max(.25, value); // Adjust opacity (min 0.25)
  }
};

/**
 * Handles errors during microphone access for the visualizer.
 * @param {Error} error - The error object.
 */
const processVisualizerError = (error) => { /* Renamed for clarity */
  console.error("Microphone access error for visualizer:", error);
  visualMainElement.classList.add('error');
  // Display error directly in the main visualizer area
  visualMainElement.innerHTML = 'Error: ' + error.name + '<br>Please allow microphone access.';
  isVisualizerActive = false;
  toggleMicButtonState(false);
  setTranscript('Mic Access Denied'); // Use transcript div for status
  speakText('Mic Access Denied'); // Speak error message
};

/**
 * Initializes the AudioContext and connects the microphone for visualization.
 */
async function startVisualizer() { /* Modified: Changed to async and added more control */
  // Only attempt to start visualizer if it's not already active
  if (isVisualizerActive) {
    return;
  }

  // Ensure visualizer elements are created (this will also remove the button from main)
  createDOMElementsForVisualizer();
  visualElements.forEach(elm => {
      elm.style.transition = 'transform 0.1s linear, opacity 0.1s linear'; // Ensure transition is on
      elm.style.transform = 'scaleY(0.5)'; // Default visible scale
      elm.style.opacity = '0.25'; // Default visible opacity
  });


  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 64; // Gives 32 frequency bins for 32 bars

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaStreamSource = audioContext.createMediaStreamSource(stream);
    mediaStreamSource.connect(analyser); // Connect mic to analyser

    isVisualizerActive = true;

    // Start the render loop for the visualizer bars
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const renderVisualizerFrame = () => {
      if (isVisualizerActive) {
        analyser.getByteFrequencyData(frequencyData); // Get frequency data
        processFrameForVisualizer(frequencyData); // Update bars
        requestAnimationFrame(renderVisualizerFrame);
      } else {
          // When visualizer stops, reset bar styles for hide effect
          visualElements.forEach(elm => {
              elm.style.transform = 'scaleY(0)';
              elm.style.opacity = '0';
          });
      }
    };
    requestAnimationFrame(renderVisualizerFrame);

  } catch (error) {
    processVisualizerError(error);
    // Important: If visualizer fails to start, put the button back
    if (!visualMainElement.contains(microphoneButton)) {
        visualMainElement.innerHTML = ''; // Clear error message if present
        visualMainElement.appendChild(microphoneButton);
    }
  }
}

/**
 * Stops the visualizer and releases microphone.
 */
function stopVisualizer() { /* Added to control visualizer stopping */
  if (mediaStreamSource) {
    mediaStreamSource.mediaStream.getTracks().forEach(track => track.stop());
    mediaStreamSource.disconnect();
    mediaStreamSource = null;
  }
  if (audioContext && audioContext.state !== 'closed') {
      audioContext.close();
      audioContext = null;
  }
  isVisualizerActive = false;
  // Hide bars immediately
  visualElements.forEach(elm => {
      elm.style.transform = 'scaleY(0)'; // Scale to 0 to make them disappear
      elm.style.opacity = '0'; // Make them transparent
  });
  // Re-append the button back to main when visualizer stops
  if (!visualMainElement.contains(microphoneButton)) {
    visualMainElement.innerHTML = ''; // Clear bars before adding button
    visualMainElement.appendChild(microphoneButton);
  }
}


// --- Speech-to-Text (STT) Functions ---

/**
 * Initializes the SpeechRecognition API.
 */
function initSpeechRecognition() { /* Added for STT initialization */
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn("Speech Recognition not supported by this browser.");
    setTranscript("Browser doesn't support STT."); // Use transcript div for status
    speakText("Browser doesn't support speech to text."); // Speak error
    microphoneButton.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true; // Keep listening even after a pause
  recognition.lang = 'en-US';
  recognition.interimResults = true; // Show interim results

  recognition.onstart = () => {
    isListeningForSTT = true;
    sttFinalTranscript = ''; // Reset transcript buffer on start
    clearTimeout(sttPauseTimer); // Clear any lingering timers
    
    // Stop any ongoing TTS before starting STT
    if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
    }

    setTranscript('Listening...');
    toggleMicButtonState(true);
  };

  recognition.onresult = (event) => {
    // Clear the pause timer every time new results arrive
    clearTimeout(sttPauseTimer);

    let interimTranscript = '';
    let finalTranscriptSinceLastResult = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscriptSinceLastResult += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }

    // Append the newly finalized part to the full transcript
    if (finalTranscriptSinceLastResult) {
      sttFinalTranscript += finalTranscriptSinceLastResult + ' ';
    }

    // Update the display with the combination of final and interim transcripts
    setTranscript(sttFinalTranscript + interimTranscript);

    // Set a timer to send the text to the backend after a pause in speech
    sttPauseTimer = setTimeout(() => {
      const textToSend = sttFinalTranscript.trim();
      if (textToSend) {
        sendToBackend(textToSend);
      }
      sttFinalTranscript = ''; // Clear the buffer after sending
    }, sttPauseDuration);
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    clearTimeout(sttPauseTimer); // Clear timer on error
    isListeningForSTT = false;
    toggleMicButtonState(false);
    stopVisualizer();

    let errorMessage = "Speech input error. Please try again.";
    if (event.error === 'no-speech') {
      errorMessage = "I didn't hear anything. Please try again.";
    } else if (event.error === 'not-allowed') {
      errorMessage = "Microphone access denied. Please allow it in your browser settings.";
    }
    setTranscript(errorMessage);
    speakText(errorMessage); // Speak error message
  };

  recognition.onend = () => {
    isListeningForSTT = false;
    // Do not toggle UI on end to keep response visible and avoid resetting to start button
    // toggleMicButtonState(false);
    // stopVisualizer();
    clearTimeout(sttPauseTimer);

    // Send any final text that hasn't been sent yet
    const textToSend = sttFinalTranscript.trim();
    if (textToSend) {
      sendToBackend(textToSend);
    }

    sttFinalTranscript = ''; // Reset buffer
  };
}

// --- Main Toggle Function for Microphone (STT & Visualizer) ---

/**
 * Toggles the microphone and STT/Visualizer on/off.
 * This function is now directly called by the button's onclick event.
 */
function toggleSTTAndVisualizer() {
  if (isListeningForSTT) {
    recognition.stop(); // This will trigger recognition.onend, which handles cleanup
  } else {
    // If not listening, start STT and Visualizer
    startVisualizer(); // Start visualizer first (requests mic access)
    recognition.start(); // Then start STT
    // States and button updates are handled in onstart callbacks
  }
}


// --- Initial Setup on Window Load ---

window.addEventListener('load', () => {
  initSpeechRecognition(); // Initialize STT

  setTranscript('Click "start" to talk.'); // Initial status message
  speakText('Click start to talk.'); // Speak initial message
});

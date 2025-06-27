// --- DOM Elements (Updated to reflect added IDs for easier access) ---
const microphoneButton = document.getElementById('microphoneButton'); // Access the button by its new ID
const transcriptDisplay = document.getElementById('transcript'); // Access the transcript div
const visualMainElement = document.querySelector('main'); // The main container for the bars

// --- Web Audio API Variables for Visualizer ---
let audioContext;
let analyser;
let mediaStreamSource;
let visualElements; // Stores references to the created div elements for bars
const visualValueCount = 32; // Number of bars

// --- Web Speech API Variables for STT ---
let recognition; // SpeechRecognition object for STT

// --- State Management ---
let isListeningForSTT = false; // Is SpeechRecognition active?
let isVisualizerActive = false; // Is the microphone connected for visualizer?


// --- UI Utility Functions ---

/**
 * Updates the transcription display text. (Now also serves as status display)
 * @param {string} text - The transcribed text or status message to display.
 */
function setTranscript(text) {
  transcriptDisplay.textContent = text;
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
    microphoneButton.disabled = true;
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true; // CHANGED: Set to true for continuous listening until explicitly stopped
  recognition.lang = 'en-US';
  recognition.interimResults = true; // Show interim results as user speaks

  recognition.onstart = () => {
    isListeningForSTT = true;
    setTranscript('Listening...');
    toggleMicButtonState(true); // Mic button active state
  };

  recognition.onresult = (event) => {
    let interimTranscript = '';
    let finalTranscript = '';
    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) {
        finalTranscript += event.results[i][0].transcript;
      } else {
        interimTranscript += event.results[i][0].transcript;
      }
    }
    setTranscript(finalTranscript || interimTranscript); // Display live or final transcript

    // No manual recognition.stop() here as continuous is true.
    // Recognition will continue until toggleSTTAndVisualizer is called to stop it.
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
    isListeningForSTT = false;
    toggleMicButtonState(false); // Reset button
    stopVisualizer(); // Stop visualizer on STT error

    let errorMessage = "Speech input error. Please try again.";
    if (event.error === 'no-speech') {
      errorMessage = "I didn't hear anything. Please try again.";
    } else if (event.error === 'not-allowed') {
      errorMessage = "Microphone access denied. Please allow it in your browser settings.";
    }
    setTranscript(errorMessage); // Use transcript div for error message
  };

  recognition.onend = () => {
    // This will only fire if recognition.stop() is called, or if there's a browser error/tab close.
    // It handles the cleanup after a deliberate stop.
    isListeningForSTT = false;
    setTranscript('Ready');
    toggleMicButtonState(false);
    stopVisualizer();
  };
}

// --- Main Toggle Function for Microphone (STT & Visualizer) ---

/**
 * Toggles the microphone and STT/Visualizer on/off.
 * This function is now directly called by the button's onclick event.
 */
function toggleSTTAndVisualizer() { // Renamed from init to match onclick, and updated logic
  if (isListeningForSTT) {
    // If currently listening, stop STT and visualizer
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
  // We defer the creation of bars until startVisualizer is called,
  // to keep the initial "start" button visible as per original code.
  // The visualMainElement will contain the button initially.

  // Initialize Web Speech Recognition API
  initSpeechRecognition();

  setTranscript('Click "start" to talk.'); // Initial status message
});

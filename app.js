let serverOnline = false;
let selectedImage = null;
let personas = JSON.parse(localStorage.getItem('personas')) || [
    {
        name: 'Default Assistant',
        model: 'mistral-nemo:latest',
        temperature: 0.7,
        systemPrompt: ''
    }
];

// Context management variables
let useFullContext = true;
let conversationHistory = [];

// Auto-resize textarea
const textarea = document.getElementById('prompt');
textarea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 200) + 'px';
});

// Temperature slider
const temperatureSlider = document.getElementById('temperature');
const temperatureValue = document.getElementById('temperatureValue');
temperatureSlider.addEventListener('input', function() {
    temperatureValue.textContent = this.value;
});

// Keep track of editing state
let currentEditingPersona = null;

async function checkServerStatus() {
    const statusIndicator = document.getElementById('serverStatus');
    const statusText = document.getElementById('serverStatusText');
    const generateButton = document.getElementById('generate');

    try {
        const response = await fetch('http://localhost:11434/api/tags');
        if (response.ok) {
            statusIndicator.className = 'status-indicator status-online';
            statusText.textContent = 'Server Online';
            generateButton.disabled = false;
            serverOnline = true;
            return true;
        }
    } catch (error) {
        console.error('Server check failed:', error);
    }

    statusIndicator.className = 'status-indicator status-offline';
    statusText.textContent = 'Server Offline';
    generateButton.disabled = true;
    serverOnline = false;
    return false;
}

async function fetchModels() {
    const isOnline = await checkServerStatus();
    if (!isOnline) {
        const modelGrid = document.getElementById('modelGrid');
        const editPersonaModel = document.getElementById('editPersonaModel');
        const personaList = document.getElementById('personaList');
        
        if (modelGrid) modelGrid.innerHTML = '<div>Server offline</div>';
        if (editPersonaModel) editPersonaModel.innerHTML = '<option value="">Server offline</option>';
        if (personaList) personaList.innerHTML = '<option value="">Server offline</option>';
        return;
    }

    try {
        const response = await fetch('http://localhost:11434/api/tags');
        const data = await response.json();
        
        // Update model grid in settings
        const modelGrid = document.getElementById('modelGrid');
        if (modelGrid) {
            modelGrid.innerHTML = '';
            data.models.forEach(model => {
                const card = document.createElement('div');
                card.className = 'model-card';
                card.innerHTML = `
                    <h3>${model.name}</h3>
                    <div class="model-meta">
                        <span class="tag">Size: ${formatSize(model.size)}</span>
                        <span class="tag">Modified: ${formatDate(model.modified_at)}</span>
                    </div>
                    <div class="model-actions">
                        <button class="btn btn-danger" onclick="deleteModel('${model.name}')">Delete</button>
                    </div>
                `;
                modelGrid.appendChild(card);
            });
        }

        // Update persona selector
        const personaList = document.getElementById('personaList');
        if (personaList) {
            const defaultPersonas = data.models.map(createDefaultPersonaFromModel);
            personaList.innerHTML = `
                <optgroup label="Models">
                    ${defaultPersonas.map(p => 
                        `<option value="${p.name}" data-is-default="true">${p.name}</option>`
                    ).join('')}
                </optgroup>
                <optgroup label="Personas">
                    ${personas.filter(p => !p.isDefault).map(p => 
                        `<option value="${p.name}">${p.name}</option>`
                    ).join('')}
                </optgroup>
            `;
            
            // After updating the list, trigger the persona change handler
            handlePersonaChange(personaList.options[personaList.selectedIndex]);
        }

        // Update model select in persona editor
        const editPersonaModel = document.getElementById('editPersonaModel');
        if (editPersonaModel) {
            editPersonaModel.innerHTML = data.models
                .map(model => `<option value="${model.name}">${model.name}</option>`)
                .join('');
        }

    } catch (error) {
        console.error('Error fetching models:', error);
        const modelGrid = document.getElementById('modelGrid');
        const editPersonaModel = document.getElementById('editPersonaModel');
        const personaList = document.getElementById('personaList');
        
        if (modelGrid) modelGrid.innerHTML = '<div>Error loading models</div>';
        if (editPersonaModel) editPersonaModel.innerHTML = '<option value="">Error loading models</option>';
        if (personaList) personaList.innerHTML = '<option value="">Error loading models</option>';
    }
}

async function generateResponse() {
    if (!serverOnline) {
        alert('Server is offline. Please check your Ollama server.');
        return;
    }

    const promptInput = document.getElementById('prompt');
    const prompt = promptInput.value;
    const personaList = document.getElementById('personaList');
    const selectedOption = personaList.options[personaList.selectedIndex];
    const isDefault = selectedOption.getAttribute('data-is-default') === 'true';
    const selectedName = personaList.value;

    let selectedPersona;
    if (isDefault) {
        selectedPersona = {
            name: selectedName,
            model: selectedName,
            temperature: 0.7,
            systemPrompt: ''
        };
    } else {
        selectedPersona = personas.find(p => p.name === selectedName);
    }

    const button = document.getElementById('generate');
    const responseDiv = document.getElementById('response');

    if (!prompt) {
        alert('Please enter a prompt');
        return;
    }

    // Add user's prompt to the response area
    const userMessage = document.createElement('div');
    userMessage.className = 'message user-message';
    userMessage.textContent = prompt;
    responseDiv.appendChild(userMessage);

    // Create contextPrompt before adding the latest user message
    const contextMessages = getContextMessages().slice(0, -1); // Exclude the latest user message
    let contextPrompt = contextMessages.map(msg => `${msg.role}: ${msg.content}`).join('\n');

    // Then, construct the full prompt
    const fullPrompt = (contextPrompt ? contextPrompt + '\n' : '') + 'user: ' + prompt + '\nassistant:';

    // Store the user message
    conversationHistory.push({ role: 'user', content: prompt });
    addMessageToConversationTree('user', prompt);

    // Add system message
    const systemMessage = document.createElement('div');
    systemMessage.className = 'message system-message';
    systemMessage.textContent = 'Generating response...';
    responseDiv.appendChild(systemMessage);

    // Create a new div for the AI response
    const aiResponse = document.createElement('div');
    aiResponse.className = 'message ai-message';
    responseDiv.appendChild(aiResponse);

    // Clear input field and reset height
    promptInput.value = '';
    promptInput.style.height = 'auto';

    button.disabled = true;

    try {
        const requestBody = {
            model: selectedPersona.model,
            prompt: fullPrompt,
            temperature: selectedPersona.temperature,
            system: selectedPersona.systemPrompt
        };

        // Add image data if present
        if (selectedImage) {
            requestBody.images = [selectedImage];
        }

        console.log('Request body:', {
            ...requestBody,
            images: requestBody.images ? ['[base64 data]'] : undefined
        });

        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const reader = response.body.getReader();
        let fullResponse = '';

        while (true) {
            const {value, done} = await reader.read();
            if (done) break;
            
            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.trim()) {
                    try {
                        const jsonResponse = JSON.parse(line);
                        if (jsonResponse.response) {
                            fullResponse += jsonResponse.response;
                            aiResponse.innerHTML = marked.parse(fullResponse);
                            responseDiv.scrollTop = responseDiv.scrollHeight;
                        }
                    } catch (e) {
                        console.error('Error parsing JSON:', e);
                    }
                }
            }
        }

        // After generation is complete
        systemMessage.textContent = 'Generation complete!';
        setTimeout(() => systemMessage.remove(), 1000);

        // Store the assistant's response
        conversationHistory.push({ role: 'assistant', content: fullResponse });
        addMessageToConversationTree('assistant', fullResponse);

    } catch (error) {
        console.error('Error:', error);
        systemMessage.textContent = 'Error generating response: ' + error.message;
    } finally {
        button.disabled = false;
        // Clear the image after sending
        selectedImage = null;
        document.getElementById('imagePreview').innerHTML = '';
    }
}

// Enter key to submit
textarea.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        generateResponse();
    }
});

setInterval(checkServerStatus, 5000);
fetchModels();

// Theme initialization
function initTheme() {
    const theme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// Theme event listeners
document.getElementById('darkModeToggle').addEventListener('click', toggleTheme);
initTheme();

// Settings modal functions
function openSettingsModal() {
    document.getElementById('settingsModal').style.display = 'block';
    fetchModels(); // Refresh the model list when opening settings
}

function closeSettingsModal() {
    document.getElementById('settingsModal').style.display = 'none';
}

// Close modal when clicking outside
window.addEventListener('click', (event) => {
    const settingsModal = document.getElementById('settingsModal');
    const personaModal = document.getElementById('personaModal');
    
    if (event.target === settingsModal) {
        closeSettingsModal();
    }
    if (event.target === personaModal) {
        closePersonaModal();
    }
});

// Model management functions
function formatSize(bytes) {
    const sizes = ['B', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString();
}

async function deleteModel(modelName) {
    if (!confirm(`Are you sure you want to delete ${modelName}?`)) {
        return;
    }

    try {
        const response = await fetch('http://localhost:11434/api/delete', {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: modelName })
        });

        if (response.ok) {
            fetchModels();
        } else {
            throw new Error('Failed to delete model');
        }
    } catch (error) {
        console.error('Error deleting model:', error);
        alert('Error deleting model: ' + error.message);
    }
}

// Pull model functions
let currentPullController = null;

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

async function pullModel() {
    const modelNameInput = document.getElementById('modelName');
    const modelName = modelNameInput.value.trim();
    const pullButton = document.getElementById('pullButton');
    const pullProgress = document.getElementById('pullProgress');
    const progressFill = document.getElementById('progressFill');
    const pullStatus = document.getElementById('pullStatus');
    const cancelButton = document.getElementById('cancelPull');

    if (!modelName) {
        alert('Please enter a model name');
        return;
    }

    // Create new AbortController for this pull
    currentPullController = new AbortController();
    
    // Show cancel button and progress
    pullButton.disabled = true;
    cancelButton.style.display = 'inline-block';
    pullProgress.style.display = 'block';
    progressFill.style.width = '0%';
    pullStatus.textContent = 'Starting download...';

    try {
        const response = await fetch('http://localhost:11434/api/pull', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: modelName }),
            signal: currentPullController.signal
        });

        const reader = response.body.getReader();
        let receivedLength = 0;
        let totalLength = 0;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = new TextDecoder().decode(value);
            const lines = chunk.split('\n').filter(line => line.trim());
            
            for (const line of lines) {
                try {
                    const data = JSON.parse(line);
                    
                    if (data.total) {
                        totalLength = data.total;
                    }
                    
                    if (data.completed) {
                        receivedLength = data.completed;
                    }

                    // Update status message with detailed progress
                    if (totalLength > 0) {
                        const progress = (receivedLength / totalLength) * 100;
                        progressFill.style.width = `${progress}%`;
                        pullStatus.textContent = `${data.status || 'Downloading'} - ${formatBytes(receivedLength)} / ${formatBytes(totalLength)} (${progress.toFixed(1)}%)`;
                    }
                } catch (e) {
                    console.error('Error parsing JSON:', e);
                }
            }
        }

        pullStatus.textContent = 'Download completed!';
        progressFill.style.width = '100%';
        modelNameInput.value = '';
        await fetchModels();

    } catch (error) {
        if (error.name === 'AbortError') {
            pullStatus.textContent = 'Download cancelled';
            // Clean up downloaded model
            try {
                await fetch('http://localhost:11434/api/delete', {
                    method: 'DELETE',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ name: modelName })
                });
            } catch (deleteError) {
                console.error('Error cleaning up cancelled download:', deleteError);
            }
        } else {
            console.error('Error pulling model:', error);
            pullStatus.textContent = `Error: ${error.message}`;
        }
    } finally {
        pullButton.disabled = false;
        cancelButton.style.display = 'none';
        currentPullController = null;
        setTimeout(() => {
            pullProgress.style.display = 'none';
            pullStatus.textContent = '';
        }, 3000);
    }
}

// Cancel model pull
function cancelModelPull() {
    if (currentPullController) {
        currentPullController.abort();
    }
}

function setupImageUpload() {
    const imageUploadBtn = document.getElementById('imageUpload');
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    imageUploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', handleImageUpload);
}

function handleImageUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = function(e) {
            selectedImage = e.target.result.split(',')[1];
            displayImagePreview(e.target.result);
        };
        reader.readAsDataURL(file);
    }
}

function displayImagePreview(imageData) {
    const previewArea = document.getElementById('imagePreview');
    previewArea.innerHTML = '';

    const previewContainer = document.createElement('div');
    previewContainer.className = 'preview-container';

    const img = document.createElement('img');
    img.src = imageData;
    img.className = 'preview-image';

    const removeButton = document.createElement('button');
    removeButton.className = 'remove-image';
    removeButton.innerHTML = '×';
    removeButton.onclick = () => {
        selectedImage = null;
        previewArea.innerHTML = '';
    };

    previewContainer.appendChild(img);
    previewContainer.appendChild(removeButton);
    previewArea.appendChild(previewContainer);
}

// Image upload initialization
setupImageUpload();

// Create default personas from models
function createDefaultPersonaFromModel(model) {
    return {
        name: model.name,
        model: model.name,
        temperature: 0.7,
        systemPrompt: '',
        isDefault: true
    };
}

function handlePersonaChange(selectedOption) {
    const isDefault = selectedOption.getAttribute('data-is-default') === 'true';
    const selectedName = selectedOption.value;
    const imageUploadBtn = document.getElementById('imageUpload');
    
    let selectedPersona;
    if (isDefault) {
        selectedPersona = {
            name: selectedName,
            model: selectedName,
            temperature: 0.7,
            systemPrompt: ''
        };
    } else {
        selectedPersona = personas.find(p => p.name === selectedName);
    }

    if (selectedPersona) {
        // Update image upload button visibility based on model
        imageUploadBtn.style.display = 
            selectedPersona.model === 'llama3.2-vision:latest' ? 'block' : 'none';

        // Update other controls...
        document.getElementById('modelList').value = selectedPersona.model;
        const temperatureSlider = document.getElementById('temperature');
        const temperatureValue = document.getElementById('temperatureValue');
        if (temperatureSlider && temperatureValue) {
            temperatureSlider.value = selectedPersona.temperature;
            temperatureValue.textContent = selectedPersona.temperature;
        }
    }
}

// Update controls row to include both models and personas
function updateControlsRow() {
    const controlsRow = document.querySelector('.controls-row');
    
    // Fetch available models from the server
    fetch('http://localhost:11434/api/tags')
        .then(response => response.json())
        .then(data => {
            const models = data.models.map(model => ({
                name: model.name,
                displayName: model.name
            }));

            // Create combined list of default model personas and user personas
            const defaultPersonas = models.map(createDefaultPersonaFromModel);
            const allPersonas = [
                ...defaultPersonas,
                ...personas.filter(p => !p.isDefault)  // Only include user-created personas
            ];

            // Update the controls row HTML
            controlsRow.innerHTML = `
                <div class="model-select-container">
                    <select id="modelList" style="display: none;">
                        ${models.map(m => `<option value="${m.name}">${m.displayName}</option>`).join('')}
                    </select>
                </div>
                <div class="persona-select-container">
                    <button id="personaButton" class="icon-button" title="Manage Personas">
                        <span class="material-symbols-outlined">person</span>
                    </button>
                    <select id="personaList">
                        <optgroup label="Models">
                            ${defaultPersonas.map(p => 
                                `<option value="${p.name}" data-is-default="true">${p.name}</option>`
                            ).join('')}
                        </optgroup>
                        <optgroup label="Personas">
                            ${personas.filter(p => !p.isDefault).map(p => 
                                `<option value="${p.name}">${p.name}</option>`
                            ).join('')}
                        </optgroup>
                    </select>
                    <div class="context-controls">
                        <button class="context-button" id="clearConversationButton" title="Clear Conversation">
                            <span class="material-symbols-outlined">clear_all</span>
                        </button>
                    </div>
                </div>
            `;

            // Re-attach event listeners
            attachControlsEventListeners();
        })
        .catch(error => {
            console.error('Error fetching models:', error);
            // Fallback to show at least the personas if server is offline
            controlsRow.innerHTML = `
                <div class="persona-select-container">
                    <button id="personaButton" class="icon-button" title="Manage Personas">
                        <span class="material-symbols-outlined">person</span>
                    </button>
                    <select id="personaList">
                        <optgroup label="Personas">
                            ${personas.filter(p => !p.isDefault).map(p => 
                                `<option value="${p.name}">${p.name}</option>`
                            ).join('')}
                        </optgroup>
                    </select>
                    <div class="context-controls">
                        <button class="context-button" id="clearConversationButton" title="Clear Conversation">
                            <span class="material-symbols-outlined">clear_all</span>
                        </button>
                    </div>
                </div>
            `;
            attachControlsEventListeners();
        });
}

// Separate function to attach event listeners
function attachControlsEventListeners() {
    document.getElementById('personaButton').addEventListener('click', openPersonaModal);
    document.getElementById('personaList').addEventListener('change', function() {
        handlePersonaChange(this.options[this.selectedIndex]);
    });
    
    const clearButton = document.getElementById('clearConversationButton');
    if (clearButton) {
        clearButton.addEventListener('click', clearConversation);
    }

    // Trigger initial check for current selection
    const personaList = document.getElementById('personaList');
    if (personaList) {
        handlePersonaChange(personaList.options[personaList.selectedIndex]);
    }
}

// Persona management functions
function openPersonaModal() {
    const modal = document.getElementById('personaModal');
    modal.style.display = 'block';
    updatePersonaList();
}

function closePersonaModal() {
    document.getElementById('personaModal').style.display = 'none';
}

function updatePersonaList() {
    const personaGrid = document.getElementById('personaGrid');
    if (!personaGrid) return;
    
    if (personas.length === 0) {
        personaGrid.innerHTML = '<div class="empty-state">No personas yet. Create one to get started!</div>';
        return;
    }
    
    personaGrid.innerHTML = personas.map(persona => {
        // Create a properly escaped attribute value for the onclick handler
        const escapedName = persona.name.replace(/"/g, '&quot;');
        
        return `
            <div class="persona-card">
                <h3>${escapeHtml(persona.name)}</h3>
                <div class="persona-meta">
                    <span class="tag">Model: ${escapeHtml(persona.model)}</span>
                    <span class="tag">Temp: ${persona.temperature}</span>
                </div>
                <div class="persona-system-prompt">
                    ${escapeHtml(persona.systemPrompt || '')}
                </div>
                <div class="persona-actions">
                    <button class="btn btn-primary" onclick="editPersona('${escapedName}')">Edit</button>
                    <button class="btn btn-danger" onclick="deletePersona('${escapedName}')">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function addPersona(persona) {
    personas.push(persona);
    localStorage.setItem('personas', JSON.stringify(personas));
    updatePersonaList();
    updateControlsRow();
}

function deletePersona(name) {
    console.log("Deleting persona:", name); // Debug log
    
    if (confirm(`Are you sure you want to delete "${name}"?`)) {
        // Find the persona by name
        const personaIndex = personas.findIndex(p => p.name === name);
        
        if (personaIndex === -1) {
            console.error(`Persona "${name}" not found`);
            return;
        }
        
        // Remove the persona from the array
        personas.splice(personaIndex, 1);
        
        // Update localStorage
        localStorage.setItem('personas', JSON.stringify(personas));
        
        // Update UI
        updatePersonaList();
        updateControlsRow();
        
        console.log(`Persona "${name}" deleted successfully`);
    }
}

function editPersona(name) {
    // Close the persona management modal first
    closePersonaModal();
    
    // Track if we're editing existing or creating new
    currentEditingPersona = name ? personas.find(p => p.name === name) : null;
    
    const persona = currentEditingPersona || {
        name: '',
        model: 'mistral-nemo:latest',
        temperature: 0.7,
        systemPrompt: ''
    };

    // Set modal title based on action
    const modalTitle = document.querySelector('#editPersonaModal .modal-header h2');
    if (modalTitle) {
        modalTitle.textContent = currentEditingPersona ? 'Edit Persona' : 'Create New Persona';
    }

    // Populate form fields
    const nameField = document.getElementById('editPersonaName');
    const temperatureSlider = document.getElementById('editPersonaTemperature');
    const temperatureValue = document.getElementById('editPersonaTemperatureValue');
    const systemPromptField = document.getElementById('editPersonaSystemPrompt');
    
    if (nameField) nameField.value = persona.name;
    if (temperatureSlider) temperatureSlider.value = persona.temperature;
    if (temperatureValue) temperatureValue.textContent = persona.temperature;
    if (systemPromptField) systemPromptField.value = persona.systemPrompt;
    
    // Attach temperature slider event if not already attached
    if (temperatureSlider && !temperatureSlider.hasEventListener) {
        temperatureSlider.addEventListener('input', function() {
            const value = document.getElementById('editPersonaTemperatureValue');
            if (value) value.textContent = this.value;
        });
        temperatureSlider.hasEventListener = true;
    }
    
    // Fetch and populate models
    fetchModels().then(() => {
        const modelSelect = document.getElementById('editPersonaModel');
        if (modelSelect && persona.model) {
            // First check if the exact model exists
            let option = modelSelect.querySelector(`option[value="${persona.model}"]`);
            
            // If not, try case-insensitive match
            if (!option) {
                Array.from(modelSelect.options).forEach(opt => {
                    if (opt.value.toLowerCase() === persona.model.toLowerCase()) {
                        opt.selected = true;
                    }
                });
            } else {
                option.selected = true;
            }
        }
    }).catch(error => {
        console.error('Error loading models for persona editor:', error);
        // Still show the modal even if models can't be loaded
    });
    
    document.getElementById('editPersonaModal').style.display = 'block';
}

function savePersonaEdit() {
    const nameField = document.getElementById('editPersonaName');
    const modelSelect = document.getElementById('editPersonaModel');
    const temperatureSlider = document.getElementById('editPersonaTemperature');
    const systemPromptField = document.getElementById('editPersonaSystemPrompt');
    
    if (!nameField || !modelSelect || !temperatureSlider || !systemPromptField) {
        console.error('Form fields not found');
        return;
    }
    
    const name = nameField.value.trim();
    const model = modelSelect.value;
    const temperature = parseFloat(temperatureSlider.value);
    const systemPrompt = systemPromptField.value;

    if (!name || !model || isNaN(temperature)) {
        alert('Please fill all fields correctly');
        return;
    }
    
    // Check for duplicate names when creating new or changing name
    const isDuplicate = currentEditingPersona 
        ? (currentEditingPersona.name !== name && personas.some(p => p.name === name))
        : personas.some(p => p.name === name);
        
    if (isDuplicate) {
        alert(`A persona named "${name}" already exists. Please choose a different name.`);
        return;
    }

    // If editing existing persona, remove the old one first
    if (currentEditingPersona) {
        personas = personas.filter(p => p.name !== currentEditingPersona.name);
    }
    
    // Add the new/updated persona
    personas.push({ name, model, temperature, systemPrompt });
    
    // Save to localStorage
    localStorage.setItem('personas', JSON.stringify(personas));
    
    // Update UI
    updatePersonaList();
    updateControlsRow();
    
    // Reset editing state and close modal
    currentEditingPersona = null;
    document.getElementById('editPersonaModal').style.display = 'none';
}

// Helper function to escape HTML for safe rendering
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Initialize UI
document.addEventListener('DOMContentLoaded', initializeUI);

function initializeUI() {
    initTabs();
    updateControlsRow();

    // Add close button handlers
    document.querySelectorAll('.close-button').forEach(button => {
        button.addEventListener('click', e => {
            e.target.closest('.modal').style.display = 'none';
        });
    });

    // Set initial state by triggering persona change
    const personaList = document.getElementById('personaList');
    if (personaList) {
        handlePersonaChange(personaList.options[personaList.selectedIndex]);
    }

    // Initialize multiverse visibility
    const multiverse = document.querySelector('.multiverse');
    const multiverseButton = document.querySelector('[title="Back to Home"]');
    if (multiverse && multiverseButton) {
        multiverse.classList.add('visible');
        multiverseButton.classList.add('active');
        document.body.style.overflow = 'hidden';
        
        // Add event listener for the multiverse toggle button
        multiverseButton.addEventListener('click', toggleMultiverse);
    }
}

// Initialize tabs
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            // Remove active class from all tabs
            tabButtons.forEach(btn => btn.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            
            // Add active class to clicked tab
            button.classList.add('active');
            document.getElementById(`${button.dataset.tab}-tab`).classList.add('active');
        });
    });
}

// Add the clearConversation function
function clearConversation() {
    if (confirm('Are you sure you want to clear the conversation?')) {
        // Clear chat area
        const responseDiv = document.getElementById('response');
        if (responseDiv) {
            responseDiv.innerHTML = '';
        }
        
        // Clear conversation history
        conversationHistory = [];
        
        // Reset the conversation tree and clear multiverse visualization
        initializeConversationTree();
        renderMultiverse();
        
        // Reset current node
        currentConversationNode = null;

        console.log('Conversation cleared'); // Debug log
    }
}

// Update the state variable near the top with other state variables
let multiverseVisible = true;

function toggleMultiverse() {
    const multiverse = document.querySelector('.multiverse');
    const button = document.querySelector('[title="Back to Home"]');
    
    if (!multiverse || !button) {
        console.error('Required multiverse elements not found');
        return;
    }

    multiverseVisible = !multiverseVisible;
    
    multiverse.classList.toggle('visible', multiverseVisible);
    button.classList.toggle('active', multiverseVisible);
    document.body.style.overflow = multiverseVisible ? 'hidden' : '';
}

// Improve the getContextMessages function
function getContextMessages() {
    if (!useFullContext) {
        return conversationHistory; // Return the flat history if not using tree context
    }
    
    // If using full context (tree-based), get messages from current branch only
    const messages = [];
    let node = currentConversationNode;
    
    // Walk up the tree to get the current conversation path
    while (node) {
        if (node.response) {
            messages.unshift({ role: 'assistant', content: node.response });
        }
        if (node.prompt) {
            messages.unshift({ role: 'user', content: node.prompt });
        }
        node = node.parent;
    }
    
    return messages;
}

// Add this new event listener setup
document.addEventListener('click', function(e) {
    if (e.target.id === 'settingsButton' || e.target.closest('#settingsButton')) {
        openSettingsModal();
    }
});
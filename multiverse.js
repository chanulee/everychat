// multiverse.js

// Conversation tree variables
let conversationRoot = null;
let currentConversationNode = null;

// Function to initialize conversation tree
function initializeConversationTree() {
    conversationRoot = null;
    currentConversationNode = null;
}

// Function to generate a unique ID for each node
function generateUniqueId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

// Define the ConversationNode class
function ConversationNode(prompt, response = null, parent = null) {
    this.id = generateUniqueId();
    this.prompt = prompt;
    this.response = response;
    this.conversationSummary = null;  // Single summary for the entire conversation node
    this.parent = parent;
    this.children = [];
    this.summarized = false;  // Flag to track if summary is generated
}

// Function to add a message to the conversation tree
async function addMessageToConversationTree(role, content) {
    if (role === 'user') {
        // Create new node with just the prompt
        const newNode = new ConversationNode(content, null, currentConversationNode);
        if (currentConversationNode) {
            currentConversationNode.children.push(newNode);
        } else {
            conversationRoot = newNode;
        }
        currentConversationNode = newNode;
        renderMultiverse();
    } else if (role === 'assistant') {
        // Add response to current node
        currentConversationNode.response = content;
        
        // Now that we have both prompt and response, generate a comprehensive summary
        summarizeConversation(currentConversationNode.prompt, content).then(summary => {
            currentConversationNode.conversationSummary = summary;
            currentConversationNode.summarized = true;
            renderMultiverse();
        });
        
        renderMultiverse();
    }
}

// Function to generate a comprehensive summary of a conversation node
async function summarizeConversation(question, answer) {
    // Get the current model from the UI
    const modelSelect = document.getElementById('modelList');
    const model = modelSelect ? modelSelect.value : 'mistral-nemo:latest';
    
    try {
        // Max length for the summary
        const maxLength = 70;
        
        // Create a detailed prompt for conversation summarization
        const summarizationPrompt = `You are creating a concise label for a node in a conversation tree visualization.

Task: Summarize this conversation exchange in under ${maxLength} characters. The summary should capture the main point of both the question and answer.
- Focus on the key information exchange 
- Capture both the user's intent and the AI's main response
- If the question is seeking information, summarize what information was requested and provided
- If the question is asking for analysis, summarize the core insight
- Be extremely concise while preserving meaning

User question:
${question}

AI response:
${answer}

Your summary (max ${maxLength} characters):`;
        
        // Make API request to summarize
        const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                prompt: summarizationPrompt,
                stream: false
            })
        });
        
        if (!response.ok) throw new Error('Summarization request failed');
        
        const data = await response.json();
        let summary = data.response.trim();
        
        // Additional validation: ensure it's within character limit
        if (summary.length > maxLength) {
            summary = summary.substring(0, maxLength - 3) + '...';
        }
        
        // Remove any quotation marks the model might have included
        summary = summary.replace(/^["']|["']$/g, '');
        
        return summary;
    } catch (error) {
        console.warn('Summarization failed:', error);
        // Fallback to simple concatenation with truncation
        const combinedText = `Q: ${question} A: ${answer}`;
        if (combinedText.length <= maxLength) return combinedText;
        
        // For longer content, try to create a balanced representation
        const halfLength = Math.floor((maxLength - 10) / 2);
        return `Q: ${question.substring(0, halfLength)}... A: ${answer.substring(0, halfLength)}...`;
    }
}

// Function to render the multiverse visualization
function renderMultiverse() {
    const multiverseDiv = document.querySelector('.multiverse');
    if (!multiverseDiv) return;
    
    // Clear existing content
    multiverseDiv.innerHTML = '';
    
    if (!conversationRoot) return;
    
    // Use a recursive function to render the tree
    const treeContainer = document.createElement('div');
    treeContainer.className = 'tree-container';
    
    function renderNode(node, parentElement) {
        const nodeContainer = document.createElement('div');
        nodeContainer.className = 'node-container';

        const nodeElement = document.createElement('div');
        nodeElement.className = 'node';
        
        // Determine what text to display in the node
        let displayText = '';
        
        if (node.response && node.conversationSummary) {
            // If we have a summary, use that
            displayText = node.conversationSummary;
        } else if (node.response) {
            // If we have both Q&A but no summary yet (being generated)
            displayText = `Q: ${node.prompt.length > 20 ? node.prompt.substring(0, 17) + '...' : node.prompt}
A: ${node.response.length > 20 ? node.response.substring(0, 17) + '...' : node.response}`;
            
            // Add loading indicator
            if (!node.summarized) {
                displayText += ' (summarizing...)';
                nodeElement.classList.add('summarizing');
            }
        } else {
            // If we only have a question (no answer yet)
            displayText = `Q: ${node.prompt.length > 40 ? node.prompt.substring(0, 37) + '...' : node.prompt}`;
        }
        
        nodeElement.textContent = displayText;
        nodeElement.dataset.nodeId = node.id;
        
        // Add tooltip with full text
        nodeElement.title = `Q: ${node.prompt}${node.response ? '\nA: ' + node.response : ''}`;
        
        // Check if this node is in the current conversation path
        let checkNode = currentConversationNode;
        while (checkNode) {
            if (checkNode === node) {
                nodeElement.classList.add('context-node');
                break;
            }
            checkNode = checkNode.parent;
        }
        
        // Highlight the current node
        if (node === currentConversationNode) {
            nodeElement.classList.add('current-node');
        }
        
        nodeElement.addEventListener('click', () => {
            selectConversationNode(node);
        });
        
        nodeContainer.appendChild(nodeElement);
        
        if (node.children.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'children-container';
            node.children.forEach(child => {
                renderNode(child, childrenContainer);
            });
            nodeContainer.appendChild(childrenContainer);
        }
        
        parentElement.appendChild(nodeContainer);
    }
    
    renderNode(conversationRoot, treeContainer);
    multiverseDiv.appendChild(treeContainer);
}

// Function to select a node in the conversation tree
function selectConversationNode(node) {
    currentConversationNode = node;
    renderMultiverse();
    // Update the chat area to reflect the current conversation path
    renderChatFromConversationNode();
}

// Function to render the chat area from the current conversation node
function renderChatFromConversationNode() {
    const responseDiv = document.getElementById('response');
    if (!responseDiv) return;
    
    // Clear existing messages
    responseDiv.innerHTML = '';
    
    // Get messages from root to current node
    const messages = [];
    let node = currentConversationNode;
    while (node) {
        messages.unshift(node);
        node = node.parent;
    }
    
    messages.forEach(node => {
        // Create user message
        const userMessageDiv = document.createElement('div');
        userMessageDiv.className = 'message user-message';
        userMessageDiv.textContent = node.prompt;
        responseDiv.appendChild(userMessageDiv);

        // Create AI message if it exists
        if (node.response) {
            const aiMessageDiv = document.createElement('div');
            aiMessageDiv.className = 'message ai-message';
            aiMessageDiv.innerHTML = marked.parse(node.response);
            responseDiv.appendChild(aiMessageDiv);
        }
    });

    // Add auto-scroll
    responseDiv.scrollTop = responseDiv.scrollHeight;
}

// Initialize the conversation tree
initializeConversationTree();

// Expose functions to be used by app.js
window.addMessageToConversationTree = addMessageToConversationTree;
window.initializeConversationTree = initializeConversationTree;
window.renderMultiverse = renderMultiverse;
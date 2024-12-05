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
    this.parent = parent;
    this.children = [];
}

// Function to add a message to the conversation tree
function addMessageToConversationTree(role, content) {
    if (role === 'user') {
        // Create new node with just the prompt
        const newNode = new ConversationNode(content, null, currentConversationNode);
        if (currentConversationNode) {
            currentConversationNode.children.push(newNode);
        } else {
            conversationRoot = newNode;
        }
        currentConversationNode = newNode;
    } else if (role === 'assistant') {
        // Add response to current node
        currentConversationNode.response = content;
    }
    
    // Update the multiverse visualization
    renderMultiverse();
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
        nodeElement.textContent = `Q: ${node.prompt}${node.response ? '\nA: ' + node.response : ''}`;
        nodeElement.dataset.nodeId = node.id;
        
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
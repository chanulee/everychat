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
function ConversationNode(role, content, parent = null) {
    this.id = generateUniqueId();
    this.role = role; // 'user' or 'assistant'
    this.content = content;
    this.parent = parent;
    this.children = [];
}

// Function to add a message to the conversation tree
function addMessageToConversationTree(role, content) {
    const newNode = new ConversationNode(role, content, currentConversationNode);
    if (currentConversationNode) {
        currentConversationNode.children.push(newNode);
    } else {
        // This is the root node
        conversationRoot = newNode;
    }
    currentConversationNode = newNode;
    
    // Update the multiverse visualization
    renderMultiverse();
}

// Function to get context messages from the current conversation path
function getContextMessages() {
    let node = currentConversationNode;
    const messages = [];
    while (node) {
        messages.unshift({ role: node.role, content: node.content });
        node = node.parent;
    }
    return messages;
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
        nodeElement.textContent = node.content;
        nodeElement.dataset.nodeId = node.id;
        
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
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message ' + (node.role === 'user' ? 'user-message' : 'ai-message');
        messageDiv.textContent = node.content;
        responseDiv.appendChild(messageDiv);
    });
}

// Initialize the conversation tree
initializeConversationTree();

// Expose functions to be used by app.js
window.addMessageToConversationTree = addMessageToConversationTree;
window.getContextMessages = getContextMessages;
window.initializeConversationTree = initializeConversationTree;
// Application State
let state = {
    releases: [],
    filteredReleases: [],
    activeFilter: 'all',
    searchQuery: '',
    lastUpdated: ''
};

// DOM Elements
const elements = {
    loader: document.getElementById('loader'),
    emptyState: document.getElementById('empty-state'),
    releasesContainer: document.getElementById('releases-container'),
    refreshBtn: document.getElementById('refresh-btn'),
    refreshIcon: document.getElementById('refresh-icon'),
    lastUpdatedText: document.getElementById('last-updated-text'),
    searchInput: document.getElementById('search-input'),
    clearSearchBtn: document.getElementById('clear-search-btn'),
    filterPills: document.getElementById('filter-pills'),
    statsBanner: document.getElementById('stats-banner'),
    resetFiltersBtn: document.getElementById('reset-filters-btn'),
    errorBanner: document.getElementById('error-banner'),
    errorMsg: document.getElementById('error-msg'),
    
    // Modal Elements
    tweetModal: document.getElementById('tweet-modal'),
    closeModalBtn: document.getElementById('close-modal-btn'),
    previewTag: document.getElementById('preview-update-type'),
    previewDate: document.getElementById('preview-update-date'),
    previewSnippet: document.getElementById('preview-update-snippet'),
    tweetTextarea: document.getElementById('tweet-textarea'),
    charCounter: document.getElementById('char-counter'),
    charWarning: document.getElementById('char-warning'),
    copyTweetBtn: document.getElementById('copy-tweet-btn'),
    publishTweetBtn: document.getElementById('publish-tweet-btn'),
    
    // Stats Count Elements
    statAll: document.getElementById('stat-all'),
    statFeature: document.getElementById('stat-feature'),
    statAnnouncement: document.getElementById('stat-announcement'),
    statBreaking: document.getElementById('stat-breaking'),
    statIssue: document.getElementById('stat-issue')
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    fetchReleases();
    setupEventListeners();
});

// Setup Event Listeners
function setupEventListeners() {
    // Refresh Button Click
    elements.refreshBtn.addEventListener('click', () => {
        fetchReleases(true);
    });

    // Search Input Interaction
    elements.searchInput.addEventListener('input', (e) => {
        state.searchQuery = e.target.value.trim().toLowerCase();
        toggleClearSearchButton();
        applyFiltersAndSearch();
    });

    // Clear Search Input
    elements.clearSearchBtn.addEventListener('click', () => {
        elements.searchInput.value = '';
        state.searchQuery = '';
        toggleClearSearchButton();
        applyFiltersAndSearch();
        elements.searchInput.focus();
    });

    // Filter Pills Click
    elements.filterPills.addEventListener('click', (e) => {
        const pill = e.target.closest('.pill');
        if (!pill) return;

        // Update active class
        document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');

        // Update active filter card visual style
        updateActiveStatCard(pill.dataset.filter);

        state.activeFilter = pill.dataset.filter;
        applyFiltersAndSearch();
    });

    // Stats Cards Click (Syncs with filters)
    elements.statsBanner.addEventListener('click', (e) => {
        const statCard = e.target.closest('.stat-card');
        if (!statCard) return;

        const filterVal = statCard.dataset.filter;
        
        // Find corresponding pill and click it
        const matchingPill = document.querySelector(`.pill[data-filter="${filterVal}"]`);
        if (matchingPill) {
            matchingPill.click();
        }
    });

    // Reset Filters Empty State Action
    elements.resetFiltersBtn.addEventListener('click', resetFilters);

    // Modal Close Trigger
    elements.closeModalBtn.addEventListener('click', closeTweetModal);
    elements.tweetModal.addEventListener('click', (e) => {
        if (e.target === elements.tweetModal) {
            closeTweetModal();
        }
    });

    // Tweet Input Character Counter
    elements.tweetTextarea.addEventListener('input', updateCharCount);

    // Copy Tweet Action
    elements.copyTweetBtn.addEventListener('click', copyTweetToClipboard);

    // Publish Tweet Action
    elements.publishTweetBtn.addEventListener('click', publishTweet);
}

// Fetch Release Notes from API
async function fetchReleases(forceRefresh = false) {
    showLoader();
    elements.errorBanner.style.display = 'none';
    
    // Add rotate animation to refresh icon
    elements.refreshIcon.classList.add('spin-animation');
    elements.refreshBtn.disabled = true;

    try {
        const url = `/api/releases${forceRefresh ? '?refresh=true' : ''}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(data.error);
        }
        
        state.releases = data.releases || [];
        state.lastUpdated = data.last_updated || 'Just now';
        
        // Show status indicators
        elements.lastUpdatedText.innerText = `Updated: ${state.lastUpdated}`;
        if (data.warning) {
            showError(data.warning);
        }

        // Compute overall stats
        calculateStats();

        // Apply filters
        applyFiltersAndSearch();

    } catch (error) {
        console.error('Fetch error:', error);
        showError(`Could not retrieve release notes: ${error.message}`);
        
        if (state.releases.length === 0) {
            elements.emptyState.style.display = 'block';
            elements.releasesContainer.style.display = 'none';
        }
    } finally {
        hideLoader();
        // Remove rotate animation
        elements.refreshIcon.classList.remove('spin-animation');
        elements.refreshBtn.disabled = false;
    }
}

// Calculate Stats for Banner
function calculateStats() {
    const counts = {
        all: state.releases.length,
        Feature: 0,
        Announcement: 0,
        Breaking: 0,
        Issue: 0
    };

    state.releases.forEach(release => {
        const type = release.type;
        if (type in counts) {
            counts[type]++;
        } else if (type === 'Change' || type === 'Update') {
            // General categories not in main banner, but we count them under total
        }
    });

    // Populate DOM counts
    elements.statAll.innerText = counts.all;
    elements.statFeature.innerText = counts.Feature;
    elements.statAnnouncement.innerText = counts.Announcement;
    elements.statBreaking.innerText = counts.Breaking;
    elements.statIssue.innerText = counts.Issue;
}

// Sync Stat Card active styling
function updateActiveStatCard(filterType) {
    document.querySelectorAll('.stat-card').forEach(card => {
        if (card.dataset.filter === filterType) {
            card.classList.add('active');
        } else {
            card.classList.remove('active');
        }
    });
}

// Apply Filters and Searches
function applyFiltersAndSearch() {
    state.filteredReleases = state.releases.filter(release => {
        // Filter by Category
        const matchesFilter = state.activeFilter === 'all' || release.type === state.activeFilter;
        
        // Search by keyword in date, type, raw html or text
        const searchPool = `${release.date} ${release.type} ${release.text}`.toLowerCase();
        const matchesSearch = !state.searchQuery || searchPool.includes(state.searchQuery);
        
        return matchesFilter && matchesSearch;
    });

    renderReleases();
}

// Render release card list
function renderReleases() {
    elements.releasesContainer.innerHTML = '';
    
    if (state.filteredReleases.length === 0) {
        elements.emptyState.style.display = 'block';
        elements.releasesContainer.style.display = 'none';
        return;
    }

    elements.emptyState.style.display = 'none';
    elements.releasesContainer.style.display = 'grid';

    state.filteredReleases.forEach(release => {
        const card = createReleaseCard(release);
        elements.releasesContainer.appendChild(card);
    });
}

// Create single release card element
function createReleaseCard(release) {
    const card = document.createElement('article');
    const lowerType = release.type.toLowerCase();
    card.className = `release-card type-${lowerType}`;
    card.id = `card-${release.id}`;
    
    // Determine corresponding tag styling class
    let tagClass = 'tag-update';
    if (['feature', 'announcement', 'breaking', 'issue', 'change'].includes(lowerType)) {
        tagClass = `tag-${lowerType}`;
    }

    card.innerHTML = `
        <div class="card-meta">
            <span class="card-date"><i class="fa-regular fa-calendar-days"></i> ${release.date}</span>
            <span class="type-tag ${tagClass}">${release.type}</span>
        </div>
        <div class="card-content">
            ${release.html}
        </div>
        <div class="card-actions">
            <button class="btn btn-secondary btn-copy" title="Copy text to clipboard">
                <i class="fa-solid fa-copy"></i> <span>Copy</span>
            </button>
            <a href="${release.link}" target="_blank" class="btn btn-secondary" title="View official release documentation page">
                <i class="fa-solid fa-arrow-up-right-from-square"></i> <span>Docs</span>
            </a>
            <button class="btn btn-tweet" title="Customize and tweet this update">
                <i class="fa-brands fa-x-twitter"></i> <span>Tweet</span>
            </button>
        </div>
    `;

    // Hook events inside card
    card.querySelector('.btn-copy').addEventListener('click', () => {
        copyTextToClipboard(release.text, card.querySelector('.btn-copy'));
    });

    card.querySelector('.btn-tweet').addEventListener('click', () => {
        openTweetModal(release);
    });

    return card;
}

// Utility Clipboard copy
async function copyTextToClipboard(text, buttonElement) {
    try {
        await navigator.clipboard.writeText(text);
        
        // Visual feedback
        const span = buttonElement.querySelector('span');
        const icon = buttonElement.querySelector('i');
        const originalText = span.innerText;
        
        span.innerText = 'Copied!';
        icon.className = 'fa-solid fa-check';
        buttonElement.classList.add('btn-success');
        
        setTimeout(() => {
            span.innerText = originalText;
            icon.className = 'fa-solid fa-copy';
            buttonElement.classList.remove('btn-success');
        }, 2000);
    } catch (err) {
        console.error('Failed to copy: ', err);
    }
}

// Open Tweet Composer Modal
function openTweetModal(release) {
    // Set preview metadata
    elements.previewTag.innerText = release.type;
    elements.previewTag.className = `preview-tag tag-${release.type.toLowerCase()}`;
    elements.previewDate.innerText = release.date;
    elements.previewSnippet.innerText = release.text;
    
    // Set initial tweet contents
    elements.tweetTextarea.value = release.tweet_text;
    
    // Show Modal
    elements.tweetModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Lock background scroll
    
    // Update character limit counter
    updateCharCount();
    
    // Focus composer area
    elements.tweetTextarea.focus();
}

// Close Tweet Modal
function closeTweetModal() {
    elements.tweetModal.style.display = 'none';
    document.body.style.overflow = ''; // Unlock scroll
}

// Update Character count check
function updateCharCount() {
    const rawText = elements.tweetTextarea.value;
    
    // Compute tweet length. URLs count as 23 characters in Twitter/X intents.
    // Let's replace any HTTP/HTTPS links in the text with a dummy 23 char placeholder to estimate accurately.
    const urlRegex = /https?:\/\/[^\s]+/g;
    let computedLength = rawText.replace(urlRegex, 'x'.repeat(23)).length;
    
    elements.charCounter.innerText = `${computedLength} / 280`;
    
    // Color warnings
    if (computedLength > 280) {
        elements.charCounter.className = 'char-count danger';
        elements.charWarning.style.display = 'inline-flex';
        elements.publishTweetBtn.disabled = true;
    } else if (computedLength > 260) {
        elements.charCounter.className = 'char-count warning';
        elements.charWarning.style.display = 'none';
        elements.publishTweetBtn.disabled = false;
    } else {
        elements.charCounter.className = 'char-count';
        elements.charWarning.style.display = 'none';
        elements.publishTweetBtn.disabled = false;
    }
}

// Copy Tweet content to clipboard
function copyTweetToClipboard() {
    const text = elements.tweetTextarea.value;
    copyTextToClipboard(text, elements.copyTweetBtn);
}

// Open Twitter Web Intent
function publishTweet() {
    const text = elements.tweetTextarea.value;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(shareUrl, '_blank', 'width=550,height=420,toolbar=0,status=0');
}

// Loader Toggles
function showLoader() {
    elements.loader.style.display = 'flex';
    elements.releasesContainer.style.display = 'none';
    elements.emptyState.style.display = 'none';
}

function hideLoader() {
    elements.loader.style.display = 'none';
}

// Error Message Visual Banner
function showError(message) {
    elements.errorMsg.innerText = message;
    elements.errorBanner.style.display = 'block';
    // Scroll to error
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Clear Filters Helper
function resetFilters() {
    elements.searchInput.value = '';
    state.searchQuery = '';
    toggleClearSearchButton();
    
    // Set pill back to All
    document.querySelectorAll('.pill').forEach(p => p.classList.remove('active'));
    const allPill = document.querySelector('.pill[data-filter="all"]');
    if (allPill) allPill.classList.add('active');
    
    updateActiveStatCard('all');
    state.activeFilter = 'all';
    
    applyFiltersAndSearch();
}

// Toggle Clear Search X button visibility
function toggleClearSearchButton() {
    if (state.searchQuery.length > 0) {
        elements.clearSearchBtn.style.display = 'block';
    } else {
        elements.clearSearchBtn.style.display = 'none';
    }
}

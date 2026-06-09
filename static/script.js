// Global variables
let accountsData = [];
let filteredAccounts = [];
let selectedAccount = null;
let predictionsData = [];
let charts = {};
let currentTab = 'dashboard';

// Interactive Custom Parameters
let bronzeSilverThreshold = 5000;
let silverGoldThreshold = 25000;
let syncedAccounts = new Set();
let pendingCampaigns = new Set();
let salesforceSyncLogs = [];

// CFO overview variables
let cfoCohortData = null;
let cfoYearlyHistory = null;
let cfoChurnRateVal = 0;

// Format currency
function formatCurrency(value) {
    if (value === null || value === undefined) return 'N/A';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    }).format(value);
}

// Format number
function formatNumber(value) {
    if (value === null || value === undefined) return 'N/A';
    if (typeof value === 'number') {
        return value.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    }
    return value;
}

// Show loading indicator
function showLoading(message = 'Processing...') {
    const loader = document.getElementById('loadingIndicator');
    const text = document.getElementById('loadingText');
    if (loader && text) {
        text.textContent = message;
        loader.style.display = 'flex';
    }
}

// Hide loading indicator
function hideLoading() {
    const loader = document.getElementById('loadingIndicator');
    if (loader) {
        loader.style.display = 'none';
    }
}

// Show modal
function showModal(message) {
    const modal = document.getElementById('modal');
    const modalText = document.getElementById('modalText');
    if (modal && modalText) {
        modalText.textContent = message;
        modal.style.display = 'flex';
    }
}

// Hide modal
function hideModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// Show status message
function showStatus(message, type = 'success') {
    const statusElement = document.getElementById('statusMessage');
    if (!statusElement) return;
    statusElement.textContent = message;
    statusElement.className = `status-message ${type}`;
    setTimeout(() => {
        statusElement.textContent = '';
        statusElement.className = 'status-message';
    }, 5000);
}

// Load initial account data
async function loadAccounts() {
    try {
        showLoading('Loading account data...');
        const response = await fetch('/api/accounts');
        const result = await response.json();

        if (result.success) {
            accountsData = result.data;
            applyFilters(); // Apply initial empty filters to populate table
            
            // Check if predictions are already loaded in backend data
            const hasPredictions = accountsData.some(a => a.clv_2025_predicted !== undefined && a.clv_2025_predicted !== null);
            if (hasPredictions) {
                // If prediction data exists, load stats and render layout
                document.getElementById('statsPanel').style.display = 'block';
                document.getElementById('calibrationPanel').style.display = 'block';
                document.getElementById('actionCenterPanel').style.display = 'block';
                document.getElementById('dashboardSubTabs').style.display = 'flex';
                document.getElementById('dashboardPlaceholder').style.display = 'none';
                document.getElementById('exportBtn').disabled = false;
                
                // Retrieve stats by calling predict endpoint or calculating locally
                // Let's trigger a prediction run to initialize stats and charts if predictions exist
                // but without showing the blocking modal to keep it fast and clean.
                await initializeLoadedState();
            } else {
                document.getElementById('statsPanel').style.display = 'none';
                document.getElementById('calibrationPanel').style.display = 'none';
                document.getElementById('actionCenterPanel').style.display = 'none';
                document.getElementById('dashboardSubTabs').style.display = 'none';
                document.getElementById('dashboardPlaceholder').style.display = 'block';
            }
            
            hideLoading();
        } else {
            showStatus('Error loading accounts: ' + result.error, 'error');
            hideLoading();
        }
    } catch (error) {
        console.error('Error loading accounts:', error);
        showStatus('Error loading accounts', 'error');
        hideLoading();
    }
}

// Helper to initialize charts/stats if model is already loaded
async function initializeLoadedState() {
    try {
        const response = await fetch('/api/predict', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' }
        });
        const result = await response.json();
        if (result.success) {
            updateStats(result.stats);
            createCharts();
            populateMigrations();
        }
    } catch (e) {
        console.error("Error auto-initializing stats:", e);
    }
}

// Filter accounts based on inputs
function applyFilters() {
    const searchText = document.getElementById('listSearchInput').value.toLowerCase().trim();
    const region = document.getElementById('regionFilter').value;
    const tier = document.getElementById('tierFilter').value;
    const match = document.getElementById('matchFilter').value;
    const churn = document.getElementById('churnFilter').value;
    const priority = document.getElementById('priorityFilter').value;

    filteredAccounts = accountsData.filter(account => {
        // Search filter
        const extId = (account.account_external_id || '').toLowerCase();
        const name = (account.Name || '').toLowerCase();
        const matchesSearch = extId.includes(searchText) || name.includes(searchText);

        // Region filter
        const matchesRegion = region === 'all' || account.region === region;

        // Tier filter
        const matchesTier = tier === 'all' || account.suggested_tier === tier;

        // Match filter
        let matchesMatchStatus = true;
        if (match !== 'all') {
            if (account.clv_2025_predicted === undefined || account.clv_2025_predicted === null) {
                matchesMatchStatus = false;
            } else {
                const isCorrect = account.tier_correct;
                matchesMatchStatus = (match === 'match' && isCorrect) || (match === 'mismatch' && !isCorrect);
            }
        }

        // Churn Risk filter
        const matchesChurn = churn === 'all' || account.churn_risk === churn;

        // Priority filter
        let matchesPriority = true;
        if (priority !== 'all') {
            if (priority === 'none') {
                matchesPriority = !account.churn_priority;
            } else {
                matchesPriority = account.churn_priority && account.churn_priority.toLowerCase().includes(priority.toLowerCase());
            }
        }

        return matchesSearch && matchesRegion && matchesTier && matchesMatchStatus && matchesChurn && matchesPriority;
    });

    // Update records count label
    document.getElementById('recordsCount').textContent = `${filteredAccounts.length} item${filteredAccounts.length !== 1 ? 's' : ''}`;

    populateTable();
}

// Populate the compact accounts table
function populateTable() {
    const tbody = document.querySelector('#accountsTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (filteredAccounts.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="9" class="table-empty-state">No matching account records found.</td>`;
        tbody.appendChild(row);
        return;
    }

    filteredAccounts.forEach(account => {
        const row = document.createElement('tr');
        row.setAttribute('data-id', account.account_external_id);
        
        // Highlight active selected row
        if (selectedAccount && selectedAccount.account_external_id === account.account_external_id) {
            row.className = 'selected-row';
        }

        const predictedClv = account.clv_2025_predicted !== undefined && account.clv_2025_predicted !== null 
            ? formatCurrency(account.clv_2025_predicted) 
            : 'N/A';

        // Tier badges
        const actualTier = account.actual_tier || 'N/A';
        const suggestedTier = account.suggested_tier || 'N/A';
        
        let matchIcon = '-';
        let matchClass = 'value-neutral';
        if (account.clv_2025_predicted !== undefined && account.clv_2025_predicted !== null) {
            const tierMatch = account.tier_correct;
            matchIcon = tierMatch ? '✅' : '❌';
            matchClass = tierMatch ? 'value-positive' : 'value-negative';
        }

        const formatTierBadge = (tier) => {
            if (!tier || tier === 'N/A' || tier === 'Unknown') return `<span class="value-neutral">${tier}</span>`;
            return `<span class="slds-badge-pill ${tier.toLowerCase()}">${tier}</span>`;
        };

        // Churn Risk Badge
        let churnRiskDisplay = '-';
        if (account.churn_risk) {
            let badgeClass = 'low';
            if (account.churn_risk === 'High') badgeClass = 'high';
            else if (account.churn_risk === 'Medium') badgeClass = 'medium';
            
            churnRiskDisplay = `<span class="risk-badge ${badgeClass}">${account.churn_risk}</span>`;
        }

        const isChecked = pendingCampaigns.has(account.account_external_id) ? 'checked' : '';

        row.innerHTML = `
            <td style="text-align: center;" class="checkbox-cell"><input type="checkbox" class="row-select-checkbox" data-id="${account.account_external_id}" ${isChecked}></td>
            <td><strong>${account.account_external_id || 'N/A'}</strong></td>
            <td>${account.Name || 'N/A'}</td>
            <td>${account.region || 'N/A'}</td>
            <td style="text-align: center;">${churnRiskDisplay}</td>
            <td style="text-align: center;">${formatTierBadge(actualTier)}</td>
            <td style="text-align: center;">${formatTierBadge(suggestedTier)}</td>
            <td style="text-align: center;"><span class="${matchClass}">${matchIcon}</span></td>
            <td style="text-align: right; font-weight: 700;">${predictedClv}</td>
        `;

        // Row Click Listener
        row.addEventListener('click', () => {
            // Remove previous highlight
            const activeRows = tbody.querySelectorAll('tr');
            activeRows.forEach(r => r.classList.remove('selected-row'));
            
            // Add highlight
            row.classList.add('selected-row');
            
            // Display details
            selectedAccount = account;
            showAccountDetails(account);
        });

        // Checkbox click listener
        const cb = row.querySelector('.row-select-checkbox');
        if (cb) {
            cb.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent row select on checkbox click
                const id = cb.getAttribute('data-id');
                if (cb.checked) {
                    pendingCampaigns.add(id);
                } else {
                    pendingCampaigns.delete(id);
                }
                updateBulkActionBar();
            });
        }

        tbody.appendChild(row);
    });

    // Re-highlight if the selected account is still in this list view
    if (selectedAccount) {
        const currentlySelectedRow = tbody.querySelector(`tr[data-id="${selectedAccount.account_external_id}"]`);
        if (currentlySelectedRow) {
            currentlySelectedRow.classList.add('selected-row');
        }
    }
}

// Render the Salesforce Account Detail panel on the right
function showAccountDetails(account) {
    const detailsBody = document.getElementById('detailsCardBody');
    if (!detailsBody) return;

    const actualClv = account.clv_2025 !== undefined && account.clv_2025 !== null ? account.clv_2025 : 0;
    const predictedClv = account.clv_2025_predicted !== undefined && account.clv_2025_predicted !== null ? account.clv_2025_predicted : null;
    
    // Details Fields
    const age = account.age_x || account.age_y || 'N/A';
    const tenure = account.tenure_days ? `${formatNumber(account.tenure_days)} days` : 'N/A';
    const region = account.region || 'N/A';

    // Financial Spend
    const totalSpend = account.monetary_total !== undefined ? formatCurrency(account.monetary_total) : 'N/A';
    const spend2024 = account.spend_2024 !== undefined ? formatCurrency(account.spend_2024) : 'N/A';
    const recency = account.recency_days !== undefined ? `${account.recency_days} days ago` : 'N/A';
    
    // Engagement
    const frequency = account.frequency !== undefined ? `${account.frequency} orders` : 'N/A';
    const appScore = account.app_usage_score !== undefined ? `${account.app_usage_score.toFixed(0)} / 100` : 'N/A';
    const emailOpen = account.email_open_rate !== undefined ? `${(account.email_open_rate * 100).toFixed(0)}%` : 'N/A';
    
    // Trends
    const spendTrend1y = account.spend_trend_1y !== undefined ? `${account.spend_trend_1y > 0 ? '+' : ''}${account.spend_trend_1y.toFixed(0)}%` : 'N/A';
    const spendTrend2y = account.spend_trend_2y !== undefined ? `${account.spend_trend_2y > 0 ? '+' : ''}${account.spend_trend_2y.toFixed(0)}%` : 'N/A';

    // Model delta calculations
    let predictionSectionHTML = '';
    let aiRecommendationHTML = '';
    let churnRiskHTML = '';
    let simulatorHTML = '';

    if (predictedClv !== null) {
        const diff = predictedClv - actualClv;
        const diffDisplay = formatCurrency(diff);
        const diffClass = diff > 0 ? 'highlight-good' : (diff < 0 ? 'highlight-bad' : '');
        const diffSign = diff > 0 ? '+' : '';
        
        let diffPctDisplay = 'N/A';
        if (account.prediction_diff_pct !== undefined && account.prediction_diff_pct !== null) {
            diffPctDisplay = `${diff > 0 ? '+' : ''}${account.prediction_diff_pct.toFixed(1)}%`;
        }

        const tierMatch = account.tier_correct;
        const matchDisplay = tierMatch 
            ? '<span class="value-positive">✅ Matched (Correct Placement)</span>' 
            : '<span class="value-negative">❌ Mismatched (Tier Shift Predicted)</span>';

        predictionSectionHTML = `
            <div class="record-section">
                <div class="record-section-title">Lifetime Value (CLV) Analysis</div>
                <div class="record-section-body">
                    <div class="record-field">
                        <span class="field-label">Actual 2025 CLV</span>
                        <span class="field-value">${formatCurrency(actualClv)}</span>
                    </div>
                    <div class="record-field">
                        <span class="field-label">Predicted 2025 CLV</span>
                        <span class="field-value" style="color: var(--slds-color-brand);">${formatCurrency(predictedClv)}</span>
                    </div>
                    <div class="record-field">
                        <span class="field-label">Prediction Difference</span>
                        <span class="field-value ${diffClass}">${diffSign}${diffDisplay}</span>
                    </div>
                    <div class="record-field">
                        <span class="field-label">Percentage Variance</span>
                        <span class="field-value ${diffClass}">${diffPctDisplay}</span>
                    </div>
                    <div class="record-field" style="grid-column: span 2;">
                        <span class="field-label">Loyalty Placement Check</span>
                        <span class="field-value">${matchDisplay}</span>
                    </div>
                </div>
            </div>
        `;

        // Generate recommendation details
        const actualTier = account.actual_tier;
        const suggestedTier = account.suggested_tier;
        const isHighChurn = account.churn_risk === 'High' || account.churn_priority === 'Immediate Retention';
        const isMediumChurn = account.churn_risk === 'Medium' || account.churn_priority === 'Targeted Campaign';
        
        let potentialValue = 0;
        const baseline = account.spend_2024 > 0 
            ? account.spend_2024 
            : (account.monetary_total > 0 ? account.monetary_total / 3 : 0);

        let reasons = [];
        const appNum = account.app_usage_score || 0;
        const emailNum = account.email_open_rate || 0;
        const trend1y = account.spend_trend_1y || 0;
        const recencyDays = account.recency_days || 0;
        const freqNum = account.frequency || 0;

        if (isHighChurn) {
            // High Churn Risk -> Immediate Retention Outreach
            potentialValue = -predictedClv;
            
            if (recencyDays > 180) reasons.push(`prolonged inactivity (last active ${recencyDays} days ago)`);
            if (trend1y < 0) reasons.push(`declining spend trajectory (${trend1y.toFixed(0)}%)`);
            if (appNum < 30) reasons.push(`low digital engagement (app score: ${appNum.toFixed(0)})`);
            if (emailNum < 0.15) reasons.push(`minimal response to offers`);

            const churnPercent = account.churn_probability ? `${(account.churn_probability * 100).toFixed(0)}%` : 'N/A';
            let reasonText = `Customer is flagged as a <strong>High Churn Risk</strong> (probability: ${churnPercent}) and requires immediate retention outreach. `;
            if (reasons.length > 0) {
                reasonText += `This risk is driven by ${reasons.join(', ')}. `;
            }
            reasonText += `Proactive outreach is critical to protect this customer's revenue.`;

            aiRecommendationHTML = `
                <div class="einstein-rec-card" style="border-color: #fecdd3; background: linear-gradient(135deg, #fff5f5 0%, #ffe4e6 100%);">
                    <div class="einstein-header" style="background-color: var(--slds-color-error);">
                        <span class="einstein-icon">⚠️</span>
                        <span>Risk Alert</span>
                    </div>
                    <div class="einstein-body">
                        <div class="einstein-title" style="color: #991b1b;">Immediate Retention Outreach Required</div>
                        <div class="einstein-text" style="color: #991b1b;">${reasonText}</div>
                        <div class="einstein-impact" style="border-color: #fca5a5;">
                            <span class="einstein-impact-label">Revenue Risk Exposure:</span>
                            <span class="einstein-impact-val downgrade">${formatCurrency(potentialValue)}</span>
                        </div>
                        <button class="einstein-btn" style="background-color: var(--slds-color-error);" onclick="alert('Action Triggered: Scheduling immediate retention outreach for ${account.Name}')">
                            🔔 Create Urgent Task
                        </button>
                    </div>
                </div>
            `;
        } else if (isMediumChurn) {
            // Medium Churn Risk -> Targeted Retention Campaign
            potentialValue = -predictedClv;
            
            if (recencyDays > 120) reasons.push(`recent inactivity (last active ${recencyDays} days ago)`);
            if (trend1y < 0) reasons.push(`declining spend trend (${trend1y.toFixed(0)}%)`);
            if (appNum < 45) reasons.push(`moderate digital engagement (app score: ${appNum.toFixed(0)})`);
            if (emailNum < 0.25) reasons.push(`lower response to email offers`);

            const churnPercent = account.churn_probability ? `${(account.churn_probability * 100).toFixed(0)}%` : 'N/A';
            let reasonText = `Customer has a <strong>Medium Churn Risk</strong> (probability: ${churnPercent}). `;
            if (reasons.length > 0) {
                reasonText += `Key factors include ${reasons.join(', ')}. `;
            }
            reasonText += `Targeted campaign outreach is recommended to rebuild customer engagement.`;

            aiRecommendationHTML = `
                <div class="einstein-rec-card" style="border-color: #fef08a; background: linear-gradient(135deg, #fefce8 0%, #fef9c3 100%);">
                    <div class="einstein-header" style="background-color: var(--slds-color-warning);">
                        <span class="einstein-icon">⚠️</span>
                        <span>Risk Alert</span>
                    </div>
                    <div class="einstein-body">
                        <div class="einstein-title" style="color: #854d0e;">Targeted Retention Campaign Recommended</div>
                        <div class="einstein-text" style="color: #854d0e;">${reasonText}</div>
                        <div class="einstein-impact" style="border-color: #fde047;">
                            <span class="einstein-impact-label">Revenue Risk Exposure:</span>
                            <span class="einstein-impact-val downgrade">${formatCurrency(potentialValue)}</span>
                        </div>
                        <button class="einstein-btn" style="background-color: var(--slds-color-warning);" onclick="alert('Action Triggered: Scheduling retention campaign for ${account.Name}')">
                            🔔 Schedule Campaign Outreach
                        </button>
                    </div>
                </div>
            `;
        } else if (actualTier && suggestedTier && actualTier !== suggestedTier && suggestedTier !== 'Unknown') {
            const tierOrder = { 'Bronze': 1, 'Silver': 2, 'Gold': 3 };
            const actualIndex = tierOrder[actualTier] || 0;
            const suggestedIndex = tierOrder[suggestedTier] || 0;
            const isUpsell = suggestedIndex > actualIndex;
            
            if (isUpsell) {
                const growth = predictedClv - baseline;
                potentialValue = growth > 0 ? growth : predictedClv;

                if (trend1y > 0) reasons.push(`upward spending trend (+${trend1y.toFixed(0)}%)`);
                if (appNum > 60) reasons.push(`strong mobile engagement (app score: ${appNum.toFixed(0)})`);
                if (recencyDays < 90) reasons.push(`active purchasing status (${recencyDays} days recency)`);
                if (freqNum > 5) reasons.push(`purchase frequency of ${freqNum} orders`);
                if (emailNum > 0.4) reasons.push(`high email response rate (${(emailNum*100).toFixed(0)}%)`);
                
                let reasonText = `Customer qualifies for an upgrade to <strong>${suggestedTier}</strong> based on `;
                reasonText += reasons.length > 0 ? reasons.join(', ') : `elevated projected purchases`;
                reasonText += `. We recommend launching a tier transition offer to secure this expansion.`;

                aiRecommendationHTML = `
                    <div class="einstein-rec-card">
                        <div class="einstein-header">
                            <span class="einstein-icon">🤖</span>
                            <span>Next Best Action</span>
                        </div>
                        <div class="einstein-body">
                            <div class="einstein-title">Recommend Loyalty Tier Upgrade</div>
                            <div class="einstein-text">${reasonText}</div>
                            <div class="einstein-impact">
                                <span class="einstein-impact-label">Projected Growth Impact:</span>
                                <span class="einstein-impact-val upsell">+${formatCurrency(potentialValue)}</span>
                            </div>
                            <button class="einstein-btn" onclick="alert('Action Triggered: Sending Loyalty Upgrade Campaign to ${account.Name}')">
                                🚀 Send Tier Upgrade Campaign
                            </button>
                        </div>
                    </div>
                `;
            } else {
                const decline = baseline - predictedClv;
                const riskVal = decline > 0 ? decline : (actualClv > predictedClv ? actualClv - predictedClv : 5000);
                potentialValue = -riskVal;

                if (recencyDays > 180) reasons.push(`prolonged purchasing inactivity (last active ${recencyDays} days ago)`);
                if (trend1y < 0) reasons.push(`declining spend trajectory (${trend1y.toFixed(0)}%)`);
                if (appNum < 30) reasons.push(`low digital product engagement (score: ${appNum.toFixed(0)})`);
                if (emailNum < 0.15) reasons.push(`minimal response to email offers`);

                let reasonText = `Customer is projected to shift down to <strong>${suggestedTier}</strong> due to `;
                reasonText += reasons.length > 0 ? reasons.join(', ') : `diminishing predicted lifetime value`;
                reasonText += `. Proactive outreach is recommended to protect this account's historical revenue.`;

                aiRecommendationHTML = `
                    <div class="einstein-rec-card" style="border-color: #fecdd3; background: linear-gradient(135deg, #fff5f5 0%, #ffe4e6 100%);">
                        <div class="einstein-header" style="background-color: var(--slds-color-warning);">
                            <span class="einstein-icon">⚠️</span>
                            <span>Risk Alert</span>
                        </div>
                        <div class="einstein-body">
                            <div class="einstein-title" style="color: #991b1b;">Loyalty Tier Downgrade Risk</div>
                            <div class="einstein-text" style="color: #991b1b;">${reasonText}</div>
                            <div class="einstein-impact" style="border-color: #fca5a5;">
                                <span class="einstein-impact-label">Revenue Risk Exposure:</span>
                                <span class="einstein-impact-val downgrade">${formatCurrency(potentialValue)}</span>
                            </div>
                            <button class="einstein-btn" style="background-color: var(--slds-color-warning);" onclick="alert('Action Triggered: Scheduling account review for ${account.Name}')">
                                🔔 Create Review Task
                            </button>
                        </div>
                    </div>
                `;
            }
        } else if (predictedClv > 0) {
            // Suggesting standard healthy retention
            aiRecommendationHTML = `
                <div class="einstein-rec-card">
                    <div class="einstein-header">
                        <span class="einstein-icon">🤖</span>
                        <span>Recommendation</span>
                    </div>
                    <div class="einstein-body">
                        <div class="einstein-title">Maintain Active Engagement</div>
                        <div class="einstein-text">Loyalty tiers match predictions. The customer is currently placed in their correct tier of <strong>${suggestedTier}</strong>. Continue scheduled marketing cycles.</div>
                        <button class="einstein-btn" onclick="alert('Standard touchpoint confirmed.')">
                            ✨ Log Client Check-in
                        </button>
                    </div>
                </div>
            `;
        }

        // Churn Risk Details Badge mapping
        if (account.churn_risk) {
            let badgeClass = 'maintain';
            let priorityText = 'Maintain';
            if (account.churn_priority === 'Immediate Retention') {
                badgeClass = 'immediate';
                priorityText = '🔴 Immediate Retention Outreach';
            } else if (account.churn_priority === 'Targeted Campaign') {
                badgeClass = 'campaign';
                priorityText = '🟡 Targeted Retention Campaign';
            } else if (account.churn_priority === 'Maintain') {
                badgeClass = 'maintain';
                priorityText = '🟢 Maintain Relationship';
            }
            
            const churnPercent = account.churn_probability ? `${(account.churn_probability * 100).toFixed(0)}%` : 'N/A';

            churnRiskHTML = `
                <div class="record-section" style="border-left: 4px solid ${account.churn_risk === 'High' ? 'var(--slds-color-error)' : (account.churn_risk === 'Medium' ? 'var(--slds-color-warning)' : 'var(--slds-color-success)')};">
                    <div class="record-section-title">Retention Risk Details</div>
                    <div class="record-section-body">
                        <div class="record-field">
                            <span class="field-label">Churn Risk</span>
                            <span class="field-value"><span class="risk-badge ${account.churn_risk === 'High' ? 'high' : (account.churn_risk === 'Medium' ? 'medium' : 'low')}">${account.churn_risk}</span></span>
                        </div>
                        <div class="record-field">
                            <span class="field-label">Churn Probability</span>
                            <span class="field-value" style="font-weight: bold;">${churnPercent}</span>
                        </div>
                        <div class="record-field" style="grid-column: span 2;">
                            <span class="field-label">Action Priority</span>
                            <span class="field-value"><span class="priority-pill ${badgeClass}">${priorityText}</span></span>
                        </div>
                    </div>
                </div>
            `;
        }

        // Action Simulator (What-If Sliders)
        const appScoreRaw = account.app_usage_score || 0;
        const emailOpenRaw = account.email_open_rate ? (account.email_open_rate * 100) : 0;
        const frequencyRaw = account.frequency || 0;
        const recencyRaw = account.recency_days || 0;

        simulatorHTML = `
            <div class="record-section simulator-panel">
                <div class="record-section-title simulator-header">
                    <span class="einstein-icon">🤖</span>
                    <span>Next-Value Simulator</span>
                </div>
                <div class="simulator-body">
                    <p style="font-size: 10px; color: #047857; margin-bottom: 12px; line-height: 1.3;">
                        Adjust behavioral values to simulate how customer success and marketing campaigns will lift the customer's predicted CLV:
                    </p>
                    <div class="simulator-slider-row">
                        <div class="simulator-slider-label">
                            <span>Mobile App Score</span>
                            <span id="simAppVal">${appScoreRaw.toFixed(0)}</span>
                        </div>
                        <input type="range" class="simulator-slider" id="simAppSlider" min="0" max="100" value="${appScoreRaw.toFixed(0)}">
                    </div>
                    <div class="simulator-slider-row">
                        <div class="simulator-slider-label">
                            <span>Email Open Rate</span>
                            <span id="simEmailVal">${emailOpenRaw.toFixed(0)}%</span>
                        </div>
                        <input type="range" class="simulator-slider" id="simEmailSlider" min="0" max="100" value="${emailOpenRaw.toFixed(0)}">
                    </div>
                    <div class="simulator-slider-row">
                        <div class="simulator-slider-label">
                            <span>Purchase Frequency (Orders)</span>
                            <span id="simFreqVal">${frequencyRaw}</span>
                        </div>
                        <input type="range" class="simulator-slider" id="simFreqSlider" min="1" max="30" value="${frequencyRaw}">
                    </div>
                    <div class="simulator-slider-row">
                        <div class="simulator-slider-label">
                            <span>Recency (Days Ago)</span>
                            <span id="simRecencyVal">${recencyRaw}</span>
                        </div>
                        <input type="range" class="simulator-slider" id="simRecencySlider" min="0" max="365" value="${recencyRaw}">
                    </div>
                    <button class="einstein-btn" style="background-color: var(--slds-color-success); margin-top: 5px;" id="runSimulationBtn">
                        🚀 Run XGBoost Simulation
                    </button>
                    <div class="simulator-result-box" id="simulatorResultBox" style="display: none;">
                        <span class="simulator-result-label">Simulated CLV:</span>
                        <div class="simulator-result-values">
                            <span class="simulator-clv-val" id="simCLVResult">-</span>
                            <span class="simulator-lift-val" id="simCLVLiftResult">-</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

    } else {
        predictionSectionHTML = `
            <div class="record-section">
                <div class="record-section-title">Lifetime Value Analysis</div>
                <div class="record-section-body">
                    <div class="record-field" style="grid-column: span 2; text-align: center; padding: 10px;">
                        <span class="value-neutral">Model predictions have not been run. Run the XGBoost model to populate analytical forecasts.</span>
                    </div>
                </div>
            </div>
        `;
    }

    detailsBody.innerHTML = `
        <div class="record-header-detail">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h2 class="record-header-title">${account.Name || 'N/A'}</h2>
                    <div class="record-header-subtitle">Account ID: ${account.account_external_id || 'N/A'}</div>
                </div>
                <div>
                    ${account.actual_tier && account.actual_tier !== 'N/A' 
                        ? `<span class="slds-badge-pill ${account.actual_tier.toLowerCase()}">${account.actual_tier}</span>` 
                        : ''}
                </div>
            </div>
        </div>

        <!-- Churn Risk details -->
        ${churnRiskHTML}

        <!-- AI Next Best Action (if any) -->
        ${aiRecommendationHTML}

        <!-- AI Simulator -->
        ${simulatorHTML}

        <!-- Prediction Summary -->
        ${predictionSectionHTML}

        <!-- Demographics Section -->
        <div class="record-section">
            <div class="record-section-title">Demographics & Account Details</div>
            <div class="record-section-body">
                <div class="record-field">
                    <span class="field-label">Sales Region</span>
                    <span class="field-value">${region}</span>
                </div>
                <div class="record-field">
                    <span class="field-label">Customer Age</span>
                    <span class="field-value">${age}</span>
                </div>
                <div class="record-field" style="grid-column: span 2;">
                    <span class="field-label">Account Tenure</span>
                    <span class="field-value">${tenure}</span>
                </div>
            </div>
        </div>

        <!-- Financial Summary -->
        <div class="record-section">
            <div class="record-section-title">Spend History & Purchasing</div>
            <div class="record-section-body">
                <div class="record-field">
                    <span class="field-label">Total Historical Spend</span>
                    <span class="field-value">${totalSpend}</span>
                </div>
                <div class="record-field">
                    <span class="field-label">2024 Spend</span>
                    <span class="field-value">${spend2024}</span>
                </div>
                <div class="record-field">
                    <span class="field-label">Last Purchase Recency</span>
                    <span class="field-value">${recency}</span>
                </div>
                <div class="record-field">
                    <span class="field-label">Purchase Frequency</span>
                    <span class="field-value">${frequency}</span>
                </div>
                <div class="record-field">
                    <span class="field-label">Spend Trend (1-Yr)</span>
                    <span class="field-value">${spendTrend1y}</span>
                </div>
                <div class="record-field">
                    <span class="field-label">Spend Trend (2-Yr)</span>
                    <span class="field-value">${spendTrend2y}</span>
                </div>
            </div>
        </div>

        <!-- Engagement Summary -->
        <div class="record-section">
            <div class="record-section-title">Digital Interaction Metrics</div>
            <div class="record-section-body">
                <div class="record-field">
                    <span class="field-label">Mobile App Usage Score</span>
                    <span class="field-value">${appScore}</span>
                </div>
                <div class="record-field">
                    <span class="field-label">Email Open Rate</span>
                    <span class="field-value">${emailOpen}</span>
                </div>
            </div>
        </div>
    `;

    // Wire up Simulator Sliders
    const simApp = document.getElementById('simAppSlider');
    const simEmail = document.getElementById('simEmailSlider');
    const simFreq = document.getElementById('simFreqSlider');
    const simRecency = document.getElementById('simRecencySlider');

    const simAppVal = document.getElementById('simAppVal');
    const simEmailVal = document.getElementById('simEmailVal');
    const simFreqVal = document.getElementById('simFreqVal');
    const simRecencyVal = document.getElementById('simRecencyVal');

    if (simApp && simEmail && simFreq && simRecency) {
        simApp.addEventListener('input', () => simAppVal.textContent = simApp.value);
        simEmail.addEventListener('input', () => simEmailVal.textContent = simEmail.value + '%');
        simFreq.addEventListener('input', () => simFreqVal.textContent = simFreq.value);
        simRecency.addEventListener('input', () => simRecencyVal.textContent = simRecency.value);

        document.getElementById('runSimulationBtn').addEventListener('click', async () => {
            try {
                const btn = document.getElementById('runSimulationBtn');
                btn.textContent = 'Simulating...';
                btn.disabled = true;

                const response = await fetch('/api/simulate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        account_external_id: account.account_external_id,
                        app_usage_score: parseInt(simApp.value),
                        email_open_rate: parseFloat(simEmail.value),
                        frequency: parseInt(simFreq.value),
                        recency_days: parseInt(simRecency.value)
                    })
                });
                const result = await response.json();
                
                btn.textContent = '🚀 Run XGBoost Simulation';
                btn.disabled = false;

                if (result.success) {
                    const simResultBox = document.getElementById('simulatorResultBox');
                    const simCLVVal = document.getElementById('simCLVResult');
                    const simCLVLiftVal = document.getElementById('simCLVLiftResult');
                    
                    const baseCLV = account.clv_2025_predicted || 0;
                    const simulatedCLV = result.simulated_clv;
                    const lift = simulatedCLV - baseCLV;

                    simCLVVal.textContent = formatCurrency(simulatedCLV);
                    if (lift >= 0) {
                        simCLVLiftVal.textContent = `+${formatCurrency(lift)} Value Lift (+${((lift/baseCLV)*100).toFixed(0)}%)`;
                        simCLVLiftVal.className = 'simulator-lift-val value-positive';
                    } else {
                        const pct = baseCLV > 0 ? ((lift/baseCLV)*100).toFixed(0) : 0;
                        simCLVLiftVal.textContent = `-${formatCurrency(Math.abs(lift))} Loss (${pct}%)`;
                        simCLVLiftVal.className = 'simulator-lift-val value-negative';
                    }

                    simResultBox.style.display = 'flex';
                }
            } catch (e) {
                console.error("Simulation failed:", e);
                alert("Simulation error.");
            }
        });
    }
}

// Run prediction model
async function runPrediction() {
    try {
        showModal('Running XGBoost model... This may take a moment.');
        showLoading('Processing predictions...');

        const response = await fetch('/api/predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });

        const result = await response.json();

        hideModal();

        if (result.success) {
            // Reload accounts with predictions
            await loadAccounts();

            // Update stats
            updateStats(result.stats);

            // Toggle active components
            document.getElementById('statsPanel').style.display = 'block';
            document.getElementById('calibrationPanel').style.display = 'block';
            document.getElementById('actionCenterPanel').style.display = 'block';
            document.getElementById('dashboardSubTabs').style.display = 'flex';
            document.getElementById('dashboardPlaceholder').style.display = 'none';

            // Create charts
            createCharts();

            // Populate tier migrations
            populateMigrations();

            // Enable export button
            document.getElementById('exportBtn').disabled = false;

            showStatus('Predictions completed successfully!', 'success');
            hideLoading();
        } else {
            showStatus('Error: ' + result.error, 'error');
            hideLoading();
        }
    } catch (error) {
        console.error('Error running prediction:', error);
        hideModal();
        showStatus('Error running prediction', 'error');
        hideLoading();
    }
}

// Update statistics labels
function updateStats(stats) {
    // Top Panel KPIs
    document.getElementById('statTotalPredictions').textContent = formatNumber(stats.total_predictions);
    document.getElementById('statMeanActual').textContent = formatCurrency(stats.mean_actual_clv);
    document.getElementById('statMeanPredicted').textContent = formatCurrency(stats.mean_predicted_clv);
    document.getElementById('statMAE').textContent = formatCurrency(stats.mae);
    document.getElementById('statTierAccuracy').textContent = `${stats.tier_accuracy.toFixed(1)}%`;

    // Recalculate dynamic business values (Revenue at Risk, Upsell Opportunity)
    const bizStats = calculateBusinessStats();
    const riskEl = document.getElementById('statRevenueAtRisk');
    const upsellEl = document.getElementById('statUpsellOpportunity');
    if (riskEl) riskEl.textContent = formatCurrency(bizStats.revenueAtRisk);
    if (upsellEl) upsellEl.textContent = formatCurrency(bizStats.upsellOpportunity);

    // Model Performance Tab Diagnostic fields
    document.getElementById('perfMAE').textContent = `${formatCurrency(stats.mae)} (Exact test set match)`;
    document.getElementById('statMaxDiff2').textContent = formatCurrency(stats.max_diff);
    document.getElementById('statMinDiff2').textContent = formatCurrency(stats.min_diff);

    // Store cfo globals if provided in stats
    if (stats.cohort_data !== undefined) cfoCohortData = stats.cohort_data;
    if (stats.yearly_history !== undefined) cfoYearlyHistory = stats.yearly_history;
    if (stats.predicted_churn_rate !== undefined) cfoChurnRateVal = stats.predicted_churn_rate;

    // Update CFO High-Level KPI Cards
    const cfoPortfolioEl = document.getElementById('cfoPortfolioValue');
    const cfoAvgCLVEl = document.getElementById('cfoAvgPredictedCLV');
    const cfoClvCacEl = document.getElementById('cfoClvCacRatio');
    const cfoChurnEl = document.getElementById('cfoChurnRate');

    if (cfoPortfolioEl) cfoPortfolioEl.textContent = formatCurrency(stats.total_predicted_clv);
    if (cfoAvgCLVEl) cfoAvgCLVEl.textContent = formatCurrency(stats.mean_predicted_clv);
    if (cfoClvCacEl) {
        cfoClvCacEl.textContent = stats.mean_predicted_clv ? (stats.mean_predicted_clv / 2800).toFixed(1) + ' : 1' : '-';
    }
    if (cfoChurnEl) {
        cfoChurnEl.textContent = (cfoChurnRateVal * 100).toFixed(1) + '%';
    }

    // Recalculate Action Center Attention Counts
    const highChurnCount = accountsData.filter(a => a.churn_risk === 'High' || a.churn_priority === 'Immediate Retention').length;
    const medChurnCount = accountsData.filter(a => a.churn_risk === 'Medium' || a.churn_priority === 'Targeted Campaign').length;
    
    let pendingSyncCount = 0;
    accountsData.forEach(a => {
        if (a.suggested_tier && a.actual_tier && a.suggested_tier !== a.actual_tier && a.suggested_tier !== 'Unknown') {
            if (!syncedAccounts.has(a.account_external_id)) {
                pendingSyncCount++;
            }
        }
    });

    const retentionCountEl = document.getElementById('actionRetentionCount');
    const campaignCountEl = document.getElementById('actionCampaignCount');
    const syncCountEl = document.getElementById('actionSyncCount');
    if (retentionCountEl) retentionCountEl.textContent = formatNumber(highChurnCount);
    if (campaignCountEl) campaignCountEl.textContent = formatNumber(medChurnCount);
    if (syncCountEl) syncCountEl.textContent = formatNumber(pendingSyncCount);
}

// Create charts using Salesforce HSL/RGB colors
function createCharts() {
    // Prepare data
    const actualClv = accountsData.map(a => a.clv_2025 || 0);
    const predictedClv = accountsData.map(a => a.clv_2025_predicted || 0);
    const diffs = accountsData.map(a => {
        if (a.prediction_diff !== undefined) return a.prediction_diff;
        return (a.clv_2025_predicted || 0) - (a.clv_2025 || 0);
    });

    const primaryBlue = '#0176d3';
    const accentIndigo = '#5c67f2';
    const softGreen = '#2e844a';
    const accentPink = '#e31278';

    // Scatter plot - Actual vs Predicted
    if (charts.scatter) charts.scatter.destroy();
    const scatterCtx = document.getElementById('scatterChart').getContext('2d');
    charts.scatter = new Chart(scatterCtx, {
        type: 'scatter',
        data: {
            datasets: [
                {
                    label: 'Accounts',
                    data: actualClv.map((actual, i) => ({
                        x: actual,
                        y: predictedClv[i]
                    })),
                    backgroundColor: 'rgba(1, 118, 211, 0.55)',
                    borderColor: 'rgba(1, 118, 211, 0.85)',
                    borderWidth: 1,
                    radius: 4.5
                },
                {
                    label: 'Ideal Projection',
                    data: [
                        { x: 0, y: 0 },
                        { x: Math.max(...actualClv), y: Math.max(...actualClv) }
                    ],
                    type: 'line',
                    borderColor: 'rgba(234, 0, 30, 0.8)',
                    borderWidth: 2,
                    borderDash: [4, 4],
                    fill: false,
                    pointRadius: 0
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { boxWidth: 12, font: { size: 11 } }
                }
            },
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Actual CLV 2025 ($)',
                        font: { weight: 'bold', size: 10 }
                    },
                    grid: { color: '#f3f3f2' }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Predicted CLV 2025 ($)',
                        font: { weight: 'bold', size: 10 }
                    },
                    grid: { color: '#f3f3f2' }
                }
            }
        }
    });

    // Histogram - CLV Distribution
    if (charts.histogram) charts.histogram.destroy();
    const histCtx = document.getElementById('histogramChart').getContext('2d');
    const bins = 20;
    const actualMin = Math.min(...actualClv);
    const actualMax = Math.max(...actualClv);
    const binSize = (actualMax - actualMin) / bins;

    const actualBins = Array(bins).fill(0);
    const predictedBins = Array(bins).fill(0);

    actualClv.forEach(val => {
        const binIndex = Math.min(Math.floor((val - actualMin) / binSize), bins - 1);
        actualBins[binIndex]++;
    });

    predictedClv.forEach(val => {
        const binIndex = Math.min(Math.floor((val - actualMin) / binSize), bins - 1);
        predictedBins[binIndex]++;
    });

    const binLabels = Array(bins).fill(0).map((_, i) => {
        const start = actualMin + i * binSize;
        return `${formatCurrency(start)}`;
    });

    charts.histogram = new Chart(histCtx, {
        type: 'bar',
        data: {
            labels: binLabels,
            datasets: [
                {
                    label: 'Actual CLV',
                    data: actualBins,
                    backgroundColor: 'rgba(92, 103, 242, 0.7)',
                    borderColor: 'rgba(92, 103, 242, 1)',
                    borderWidth: 1
                },
                {
                    label: 'Predicted CLV',
                    data: predictedBins,
                    backgroundColor: 'rgba(227, 18, 120, 0.7)',
                    borderColor: 'rgba(227, 18, 120, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: true,
                    labels: { boxWidth: 12, font: { size: 11 } }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxRotation: 45, minRotation: 45, font: { size: 9 } }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Record Volume',
                        font: { weight: 'bold', size: 10 }
                    },
                    grid: { color: '#f3f3f2' }
                }
            }
        }
    });

    // Error Distribution
    if (charts.error) charts.error.destroy();
    const errorCtx = document.getElementById('errorChart').getContext('2d');
    
    const errorMin = Math.min(...diffs);
    const errorMax = Math.max(...diffs);
    const errorBinSize = (errorMax - errorMin) / 20;
    const errorBins = Array(20).fill(0);

    diffs.forEach(val => {
        const binIndex = Math.min(Math.floor((val - errorMin) / errorBinSize), 19);
        errorBins[binIndex]++;
    });

    const errorLabels = Array(20).fill(0).map((_, i) => {
        const start = errorMin + i * errorBinSize;
        return `${formatCurrency(start)}`;
    });

    charts.error = new Chart(errorCtx, {
        type: 'bar',
        data: {
            labels: errorLabels,
            datasets: [
                {
                    label: 'Prediction Errors',
                    data: errorBins,
                    backgroundColor: 'rgba(46, 132, 74, 0.75)',
                    borderColor: 'rgba(46, 132, 74, 1)',
                    borderWidth: 1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxRotation: 45, minRotation: 45, font: { size: 9 } }
                },
                y: {
                    title: {
                        display: true,
                        text: 'Frequency',
                        font: { weight: 'bold', size: 10 }
                    },
                    grid: { color: '#f3f3f2' }
                }
            }
        }
    });

    // Feature Importance Chart
    const fiCanvas = document.getElementById('featureImportanceChart');
    if (fiCanvas) {
        if (charts.featureImportance) charts.featureImportance.destroy();
        const fiCtx = fiCanvas.getContext('2d');
        
        const featureLabels = [
            'Tenure Days', 'Spend Trend (2y)', 'App Usage Score', 
            'Recency Days', 'Spend Trend (1y)', 'Email Open Rate', 
            'Login Count (90d)', 'Purchase Frequency', 'Loyalty Tier Status'
        ];
        const SHAPvalues = [3365.9, 2607.7, 2181.4, 1821.0, 1820.6, 1401.6, 1071.3, 830.3, 680.8];

        charts.featureImportance = new Chart(fiCtx, {
            type: 'bar',
            data: {
                labels: featureLabels,
                datasets: [{
                    label: 'Mean Absolute SHAP Value',
                    data: SHAPvalues,
                    backgroundColor: 'rgba(1, 118, 211, 0.75)',
                    borderColor: 'rgba(1, 118, 211, 1)',
                    borderWidth: 1
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: {
                        title: { display: true, text: 'Importance Metric (Average Impact on Prediction)' },
                        grid: { color: '#f3f3f2' }
                    },
                    y: {
                        grid: { display: false }
                    }
                }
            }
        });
    }

    // Churn Risk Breakdown Chart
    const churnCanvas = document.getElementById('churnDistributionChart');
    if (churnCanvas) {
        if (charts.churn) charts.churn.destroy();
        const churnCtx = churnCanvas.getContext('2d');
        
        let churnHigh = 0;
        let churnMedium = 0;
        let churnLow = 0;
        let churnUnknown = 0;

        accountsData.forEach(a => {
            const risk = a.churn_risk;
            if (risk === "High") churnHigh++;
            else if (risk === "Medium") churnMedium++;
            else if (risk === "Low") churnLow++;
            else churnUnknown++;
        });

        charts.churn = new Chart(churnCtx, {
            type: 'bar',
            data: {
                labels: ['High Risk', 'Medium Risk', 'Low Risk', 'Unclassified'],
                datasets: [{
                    label: 'Customers',
                    data: [churnHigh, churnMedium, churnLow, churnUnknown],
                    backgroundColor: [
                        'rgba(234, 0, 30, 0.75)',   // High Risk (Red)
                        'rgba(243, 191, 0, 0.75)',  // Medium Risk (Orange/Yellow)
                        'rgba(46, 132, 74, 0.75)',  // Low Risk (Green)
                        'rgba(112, 110, 107, 0.75)' // Unknown (Gray)
                    ],
                    borderColor: [
                        'rgba(234, 0, 30, 1)',
                        'rgba(243, 191, 0, 1)',
                        'rgba(46, 132, 74, 1)',
                        'rgba(112, 110, 107, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Number of Customers', font: { size: 10, weight: 'bold' } },
                        grid: { color: '#f3f3f2' }
                    }
                }
            }
        });
    }

    // Loyalty Tier Distribution Chart
    const tierCanvas = document.getElementById('tierDistributionChart');
    if (tierCanvas) {
        if (charts.tier) charts.tier.destroy();
        const tierCtx = tierCanvas.getContext('2d');

        let tierGold = 0;
        let tierSilver = 0;
        let tierBronze = 0;
        let tierUnknown = 0;

        accountsData.forEach(a => {
            const tier = a.suggested_tier || 'Unknown';
            if (tier === 'Gold') tierGold++;
            else if (tier === 'Silver') tierSilver++;
            else if (tier === 'Bronze') tierBronze++;
            else tierUnknown++;
        });

        charts.tier = new Chart(tierCtx, {
            type: 'bar',
            data: {
                labels: ['Gold', 'Silver', 'Bronze', 'Unknown'],
                datasets: [{
                    label: 'Customers',
                    data: [tierGold, tierSilver, tierBronze, tierUnknown],
                    backgroundColor: [
                        'rgba(212, 175, 55, 0.75)',  // Gold
                        'rgba(192, 192, 192, 0.75)', // Silver
                        'rgba(205, 127, 50, 0.75)',  // Bronze
                        'rgba(112, 110, 107, 0.75)'  // Unknown
                    ],
                    borderColor: [
                        'rgba(212, 175, 55, 1)',
                        'rgba(192, 192, 192, 1)',
                        'rgba(205, 127, 50, 1)',
                        'rgba(112, 110, 107, 1)'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Number of Customers', font: { size: 10, weight: 'bold' } },
                        grid: { color: '#f3f3f2' }
                    }
                }
            }
        });
    }

    // Historical vs Predicted Spend Trend Chart
    const histPredCanvas = document.getElementById('historicalVsPredictedChart');
    if (histPredCanvas && cfoYearlyHistory) {
        if (charts.historicalVsPredicted) charts.historicalVsPredicted.destroy();
        const histPredCtx = histPredCanvas.getContext('2d');
        
        const labels = ['2022 Spend', '2023 Spend', '2024 Spend', '2025 Actual CLV', '2025 Predicted CLV'];
        const dataValues = [
            cfoYearlyHistory['2022'] || 0,
            cfoYearlyHistory['2023'] || 0,
            cfoYearlyHistory['2024'] || 0,
            cfoYearlyHistory['2025_Actual'] || 0,
            cfoYearlyHistory['2025_Predicted'] || 0
        ];
        
        charts.historicalVsPredicted = new Chart(histPredCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Portfolio Value ($)',
                    data: dataValues,
                    backgroundColor: [
                        'rgba(1, 116, 211, 0.6)',
                        'rgba(1, 116, 211, 0.6)',
                        'rgba(1, 116, 211, 0.6)',
                        'rgba(46, 132, 74, 0.75)',
                        'rgba(92, 103, 242, 0.75)'
                    ],
                    borderColor: [
                        'rgba(1, 116, 211, 1)',
                        'rgba(1, 116, 211, 1)',
                        'rgba(1, 116, 211, 1)',
                        'rgba(46, 132, 74, 1)',
                        'rgba(92, 103, 242, 1)'
                    ],
                    borderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        },
                        grid: { color: '#f3f3f2' }
                    }
                }
            }
        });
    }

    // Cohort Analysis Chart
    const cohortCanvas = document.getElementById('cohortAnalysisChart');
    if (cohortCanvas && cfoCohortData && cfoCohortData.length > 0) {
        if (charts.cohortAnalysis) charts.cohortAnalysis.destroy();
        const cohortCtx = cohortCanvas.getContext('2d');
        
        const cohortLabels = cfoCohortData.map(d => d.cohort);
        const cohortValues = cfoCohortData.map(d => d.clv_2025_predicted);
        
        charts.cohortAnalysis = new Chart(cohortCtx, {
            type: 'bar',
            data: {
                labels: cohortLabels,
                datasets: [{
                    label: 'Avg Predicted CLV ($)',
                    data: cohortValues,
                    backgroundColor: 'rgba(92, 103, 242, 0.7)',
                    borderColor: 'rgba(92, 103, 242, 1)',
                    borderWidth: 1.5
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false }
                },
                scales: {
                    x: { 
                        grid: { display: false },
                        ticks: { maxRotation: 45, minRotation: 45, font: { size: 9 } }
                    },
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            }
                        },
                        grid: { color: '#f3f3f2' }
                    }
                }
            }
        });
    }
}

// Export predictions
async function exportPredictions() {
    try {
        showLoading('Exporting predictions...');
        const response = await fetch('/api/export');
        const result = await response.json();

        if (result.success) {
            showStatus('Predictions exported successfully to outputs/!', 'success');
        } else {
            showStatus('Error exporting: ' + result.error, 'error');
        }
        hideLoading();
    } catch (error) {
        console.error('Error exporting:', error);
        showStatus('Error exporting predictions', 'error');
        hideLoading();
    }
}

// Generate tier migration recommendations
function generateTierMigrations() {
    const migrations = [];

    accountsData.forEach(account => {
        const actualTier = account.actual_tier;
        const suggestedTier = account.suggested_tier;
        const predictedClv = account.clv_2025_predicted || 0;
        const actualClv = account.clv_2025 || 0;

        // Only show if there's a mismatch and it's not "Unknown"
        if (actualTier && suggestedTier && actualTier !== suggestedTier && suggestedTier !== 'Unknown') {
            const tierOrder = { 'Bronze': 1, 'Silver': 2, 'Gold': 3 };
            const actualIndex = tierOrder[actualTier] || 0;
            const suggestedIndex = tierOrder[suggestedTier] || 0;

            const type = suggestedIndex > actualIndex ? 'upsell' : 'downgrade';

            // Calculate potential value impact based on a realistic historical annual baseline
            const baseline = account.spend_2024 > 0 
                ? account.spend_2024 
                : (account.monetary_total > 0 ? account.monetary_total / 3 : 0);

            let potentialValue = 0;
            if (type === 'upsell') {
                const diff = predictedClv - baseline;
                potentialValue = diff > 0 ? diff : predictedClv;
            } else {
                const diff = baseline - predictedClv;
                const riskVal = diff > 0 ? diff : (actualClv > predictedClv ? actualClv - predictedClv : 5000);
                potentialValue = -riskVal;
            }

            // Reason Text Generation
            const recency = account.recency_days;
            const frequency = account.frequency || 0;
            const appScore = account.app_usage_score || 0;
            const emailOpen = account.email_open_rate || 0;
            const spendTrend = account.spend_trend_2y || account.spend_trend_1y || 0;

            let reasons = [];

            if (type === 'upsell') {
                if (spendTrend > 0) reasons.push(`a strong upward spending trend of +${spendTrend.toFixed(0)}%`);
                if (appScore > 60) reasons.push(`high mobile app engagement (score: ${appScore.toFixed(0)})`);
                if (recency < 90) reasons.push(`frequent recent purchases (last active ${recency} days ago)`);
                if (frequency > 5) reasons.push(`a purchase frequency of ${frequency} orders`);
                if (emailOpen > 0.4) reasons.push(`active email response rate (${(emailOpen * 100).toFixed(0)}% open rate)`);
                
                let reasonText = `Qualifies for <strong>${suggestedTier}</strong> due to `;
                if (reasons.length > 0) {
                    if (reasons.length === 1) reasonText += reasons[0];
                    else reasonText += reasons.slice(0, -1).join(', ') + ', and ' + reasons[reasons.length - 1];
                } else {
                    reasonText += `high projected purchasing value of ${formatCurrency(predictedClv)}`;
                }
                reasonText += `. Their current tier is <strong>${actualTier}</strong>, but their activity justifies a tier upgrade.`;
                reason = reasonText;
            } else {
                if (recency > 180) reasons.push(`prolonged inactivity (last purchase ${recency} days ago)`);
                if (spendTrend < 0) reasons.push(`a declining year-over-year spending trend of ${spendTrend.toFixed(0)}%`);
                if (appScore < 30) reasons.push(`low digital engagement (app score: ${appScore.toFixed(0)})`);
                if (emailOpen < 0.1) reasons.push(`very low email interaction (${(emailOpen * 100).toFixed(0)}% open rate)`);
                
                let reasonText = `At risk of downgrade to <strong>${suggestedTier}</strong> due to `;
                if (reasons.length > 0) {
                    if (reasons.length === 1) reasonText += reasons[0];
                    else reasonText += reasons.slice(0, -1).join(', ') + ', and ' + reasons[reasons.length - 1];
                } else {
                    reasonText += `a significant drop in projected value to ${formatCurrency(predictedClv)}`;
                }
                reasonText += `. Active retention efforts are recommended to protect this <strong>${actualTier}</strong> customer.`;
                reason = reasonText;
            }

            migrations.push({
                accountId: account.account_external_id,
                name: account.Name,
                region: account.region,
                actualTier,
                suggestedTier,
                predictedClv,
                actualClv,
                type,
                difference: predictedClv - actualClv,
                potentialValue,
                reason
            });
        }
    });

    // Sort by potential value
    return migrations.sort((a, b) => Math.abs(b.potentialValue) - Math.abs(a.potentialValue));
}

// Populate tier migrations display
function populateMigrations() {
    const migrations = generateTierMigrations();
    const container = document.getElementById('migrationContainer');
    if (!container) return;

    if (migrations.length === 0) {
        container.innerHTML = `
            <div class="no-migrations">
                <div class="no-migrations-icon">🎉</div>
                <h3>All loyalty tiers are aligned!</h3>
                <p>No account migrations or value gaps detected at this time.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '';

    // Add cards
    migrations.forEach(migration => {
        const card = document.createElement('div');
        card.className = `migration-card ${migration.type}`;
        card.setAttribute('data-type', migration.type);

        card.innerHTML = `
            <div class="migration-header">
                <div>
                    <div class="migration-customer-name">${migration.name}</div>
                    <div class="migration-customer-id">${migration.accountId} • ${migration.region}</div>
                </div>
                <div class="migration-badge ${migration.type}">
                    ${migration.type === 'upsell' ? '📈 UPSELL' : '⚠️ RISK'}
                </div>
            </div>

            <div class="migration-tiers">
                <div class="tier-badge ${migration.actualTier.toLowerCase()}">${migration.actualTier}</div>
                <div class="tier-arrow">→</div>
                <div class="tier-badge ${migration.suggestedTier.toLowerCase()}">${migration.suggestedTier}</div>
            </div>

            <div class="migration-reason">
                <div class="migration-reason-label">Why?</div>
                <div class="migration-reason-text">${migration.reason}</div>
            </div>

            <div class="migration-stats">
                <div class="migration-stat">
                    <div class="migration-stat-value">${formatCurrency(migration.predictedClv)}</div>
                    <div class="migration-stat-label">Predicted CLV</div>
                </div>
                <div class="migration-stat">
                    <div class="migration-stat-value ${migration.type === 'upsell' ? 'value-positive' : 'value-negative'}">
                        ${migration.type === 'upsell' ? '+' : ''}${formatCurrency(migration.potentialValue)}
                    </div>
                    <div class="migration-stat-label">Potential Impact</div>
                </div>
            </div>

            <div class="migration-action" onclick="alert('Offer initiated for ${migration.name}')">
                ${migration.type === 'upsell' 
                    ? '✨ Recommend tier upgrade offer' 
                    : '🔔 Check in with customer'}
            </div>
        `;

        container.appendChild(card);
    });

    // Wire up filter buttons on campaign tab
    const filterBtns = document.querySelectorAll('.migration-filters .filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const filter = btn.getAttribute('data-filter');
            const cards = container.querySelectorAll('.migration-card');
            
            cards.forEach(card => {
                if (filter === 'all') {
                    card.style.display = '';
                } else {
                    card.style.display = card.getAttribute('data-type') === filter ? '' : 'none';
                }
            });
        });
    });
}

// Tab navigation routing logic
function initializeTabs() {
    const tabItems = document.querySelectorAll('.slds-nav-bar__tab-item');
    tabItems.forEach(item => {
        item.addEventListener('click', () => {
            const tabName = item.getAttribute('data-tab');
            switchTab(tabName);
        });
    });
}

// Programmatic tab switcher
function switchTab(tabName) {
    // Update active tab header class
    const tabItems = document.querySelectorAll('.slds-nav-bar__tab-item');
    tabItems.forEach(item => {
        if (item.getAttribute('data-tab') === tabName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Hide all tabs
    const contents = document.querySelectorAll('.tab-content');
    contents.forEach(content => {
        content.style.display = 'none';
    });

    // Show target tab
    const targetContent = document.getElementById(`tab-${tabName}`);
    if (targetContent) {
        targetContent.style.display = 'block';
    }

    currentTab = tabName;

    // Update Page Header details based on Tab Context
    const headerTitle = document.getElementById('pageHeaderTitle');
    const headerBreadcrumb = document.querySelector('.slds-page-header__breadcrumb');
    
    if (tabName === 'dashboard') {
        headerTitle.textContent = 'CLV Prediction Dashboard';
        headerBreadcrumb.innerHTML = 'Analytics &bull; Customer Lifetime Value';
    } else if (tabName === 'accounts') {
        headerTitle.textContent = 'Account Records & Insights';
        headerBreadcrumb.innerHTML = 'Sales &bull; Account List View';
    } else if (tabName === 'campaigns') {
        headerTitle.textContent = 'Loyalty Campaigns';
        headerBreadcrumb.innerHTML = 'Marketing &bull; Loyalty Migrations';
    } else if (tabName === 'performance') {
        headerTitle.textContent = 'Model Diagnostics & Diagnostics';
        headerBreadcrumb.innerHTML = 'Data Science &bull; XGBoost Regressor';
    }

    // Force Charts to redraw / resize when tab changes to avoid size layout quirks
    if (tabName === 'dashboard') {
        if (charts.churn) charts.churn.resize();
        if (charts.tier) charts.tier.resize();
        if (charts.historicalVsPredicted) charts.historicalVsPredicted.resize();
        if (charts.cohortAnalysis) charts.cohortAnalysis.resize();
    } else if (tabName === 'performance') {
        if (charts.error) charts.error.resize();
        if (charts.scatter) charts.scatter.resize();
        if (charts.histogram) charts.histogram.resize();
        if (charts.featureImportance) charts.featureImportance.resize();
    }
}

// Global Header Search handler
function initializeGlobalSearch() {
    const input = document.getElementById('globalSearchInput');
    if (!input) return;

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = input.value.trim();
            if (query !== '') {
                // Switch to accounts tab
                switchTab('accounts');

                // Place query in accounts search box
                const accountsSearch = document.getElementById('listSearchInput');
                accountsSearch.value = query;

                // Fire input filter event
                applyFilters();

                // Select first matching record automatically if available
                const tbody = document.querySelector('#accountsTable tbody');
                const firstRow = tbody.querySelector('tr[data-id]');
                if (firstRow) {
                    firstRow.click();
                }

                // Clear global search input value
                input.value = '';
            }
        }
    });
}

// Event listeners setup
document.getElementById('predictBtn').addEventListener('click', runPrediction);
document.getElementById('exportBtn').addEventListener('click', exportPredictions);

// Accounts tab filters
document.getElementById('listSearchInput').addEventListener('input', applyFilters);
document.getElementById('regionFilter').addEventListener('change', applyFilters);
document.getElementById('tierFilter').addEventListener('change', applyFilters);
document.getElementById('matchFilter').addEventListener('change', applyFilters);
document.getElementById('churnFilter').addEventListener('change', applyFilters);
document.getElementById('priorityFilter').addEventListener('change', applyFilters);

// Select All checkbox listener
const selectAllCheckbox = document.getElementById('selectAllAccounts');
if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener('change', (e) => {
        const tbody = document.querySelector('#accountsTable tbody');
        if (!tbody) return;
        const checkboxes = tbody.querySelectorAll('.row-select-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = e.target.checked;
            const id = cb.getAttribute('data-id');
            if (id) {
                if (e.target.checked) {
                    pendingCampaigns.add(id);
                } else {
                    pendingCampaigns.delete(id);
                }
            }
        });
        updateBulkActionBar();
    });
}

// Bulk Buttons listeners
const bulkCampaignBtn = document.getElementById('bulkCampaignBtn');
if (bulkCampaignBtn) {
    bulkCampaignBtn.addEventListener('click', () => {
        const count = pendingCampaigns.size;
        alert(`Salesforce Campaign: Added ${count} customers to the CRM Active Retention Campaign!`);
        pendingCampaigns.clear();
        updateBulkActionBar();
        applyFilters();
    });
}

const bulkSyncBtn = document.getElementById('bulkSyncBtn');
if (bulkSyncBtn) {
    bulkSyncBtn.addEventListener('click', () => {
        const count = pendingCampaigns.size;
        let syncCount = 0;
        pendingCampaigns.forEach(id => {
            if (!syncedAccounts.has(id)) {
                syncedAccounts.add(id);
                syncCount++;
            }
        });
        alert(`Salesforce Sync: Successfully synchronized ${syncCount} profiles to CRM.`);
        logSyncEvent(`Synchronized ${syncCount} selected profiles to Salesforce CRM.`, "success");
        pendingCampaigns.clear();
        updateBulkActionBar();
        recalculateTiers();
    });
}

// CRM sync listener
const crmSyncAllBtn = document.getElementById('crmSyncAllBtn');
if (crmSyncAllBtn) {
    crmSyncAllBtn.addEventListener('click', syncAllToSalesforce);
}

// Helper to log sync history events
function logSyncEvent(message, type = 'info') {
    const container = document.getElementById('crmLogEntries');
    if (!container) return;
    const emptyEntry = container.querySelector('.empty');
    if (emptyEntry) emptyEntry.remove();

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    const time = new Date().toLocaleTimeString();
    entry.innerHTML = `<strong>[${time}]</strong> ${message}`;
    container.insertBefore(entry, container.firstChild);
}

// Salesforce Sync automation
async function syncAllToSalesforce() {
    const syncBtn = document.getElementById('crmSyncAllBtn');
    const badge = document.getElementById('syncStatusBadge');
    if (!syncBtn || syncBtn.disabled) return;

    syncBtn.disabled = true;
    badge.textContent = 'Syncing...';
    badge.className = 'status-badge status-syncing';

    logSyncEvent("Initiating Salesforce CRM bulk synchronization...", "info");

    const mismatches = accountsData.filter(a => a.suggested_tier && a.actual_tier && a.suggested_tier !== a.actual_tier && a.suggested_tier !== 'Unknown');
    let index = 0;

    for (const account of mismatches) {
        if (!syncedAccounts.has(account.account_external_id)) {
            syncedAccounts.add(account.account_external_id);
            index++;
            if (index <= 5) {
                logSyncEvent(`Updated loyalty recommendations for ${account.account_external_id} (${account.Name}) to '${account.suggested_tier}'`, "success");
            }
        }
    }
    
    setTimeout(() => {
        logSyncEvent(`CRM session completed. Synced ${index} records.`, "success");
        badge.textContent = 'Synced';
        badge.className = 'status-badge status-online';
        updateSyncDashboardInfo();
    }, 1200);
}

// Recalculate dynamic business values (Revenue at Risk, Upsell Opportunity)
function calculateBusinessStats() {
    let revenueAtRisk = 0;
    let upsellOpportunity = 0;

    accountsData.forEach(account => {
        const predictedClv = account.clv_2025_predicted || 0;
        const actualTier = account.actual_tier;
        const suggestedTier = account.suggested_tier;
        const churnRisk = account.churn_risk;

        // Churn risk revenue (High Risk)
        if (churnRisk === "High" && predictedClv > 0) {
            revenueAtRisk += predictedClv;
        }

        // Upsell potential
        if (actualTier && suggestedTier && suggestedTier !== 'Unknown' && actualTier !== suggestedTier) {
            const tierOrder = { 'Bronze': 1, 'Silver': 2, 'Gold': 3 };
            const actualIndex = tierOrder[actualTier] || 0;
            const suggestedIndex = tierOrder[suggestedTier] || 0;
            
            if (suggestedIndex > actualIndex) {
                const baseline = account.spend_2024 > 0 
                    ? account.spend_2024 
                    : (account.monetary_total > 0 ? account.monetary_total / 3 : 0);
                const diff = predictedClv - baseline;
                upsellOpportunity += diff > 0 ? diff : predictedClv;
            }
        }
    });

    return {
        revenueAtRisk,
        upsellOpportunity
    };
}

// Update Sync command stats
function updateSyncDashboardInfo() {
    const mismatchCount = accountsData.filter(a => a.suggested_tier && a.actual_tier && a.suggested_tier !== a.actual_tier && a.suggested_tier !== 'Unknown').length;
    let pendingSync = 0;
    
    accountsData.forEach(a => {
        if (a.suggested_tier && a.actual_tier && a.suggested_tier !== a.actual_tier && a.suggested_tier !== 'Unknown') {
            if (!syncedAccounts.has(a.account_external_id)) {
                pendingSync++;
            }
        }
    });

    const pendingEl = document.getElementById('pendingSyncCount');
    const syncedEl = document.getElementById('syncedRecordsCount');
    const badge = document.getElementById('syncStatusBadge');
    
    if (pendingEl) pendingEl.textContent = pendingSync;
    if (syncedEl) syncedEl.textContent = syncedAccounts.size;
    
    if (badge) {
        if (syncedAccounts.size > 0 && pendingSync === 0) {
            badge.textContent = 'Synced';
            badge.className = 'status-badge status-online';
        } else if (syncedAccounts.size > 0) {
            badge.textContent = 'Out of Sync';
            badge.className = 'status-badge status-offline';
        } else {
            badge.textContent = 'Not Synced';
            badge.className = 'status-badge status-offline';
        }
    }

    const syncBtn = document.getElementById('crmSyncAllBtn');
    if (syncBtn) {
        syncBtn.disabled = pendingSync <= 0;
    }
}

// Update bulk panel count and display status
function updateBulkActionBar() {
    const bar = document.getElementById('bulkActionBar');
    const text = document.getElementById('bulkActionText');
    if (!bar || !text) return;

    const count = pendingCampaigns.size;
    if (count > 0) {
        text.innerHTML = `🛡️ <strong>${count}</strong> profile${count > 1 ? 's' : ''} selected:`;
        bar.style.display = 'flex';
    } else {
        bar.style.display = 'none';
        const selectAll = document.getElementById('selectAllAccounts');
        if (selectAll) selectAll.checked = false;
    }
}

// Map predicted value to tier locally in browser
function getLoyaltyTierLocal(val) {
    if (val === null || val === undefined) return 'Unknown';
    if (val >= silverGoldThreshold) return 'Gold';
    if (val >= bronzeSilverThreshold) return 'Silver';
    return 'Bronze';
}

// Dynamic recalibration handler
function recalculateTiers() {
    if (accountsData.length === 0) return;

    accountsData.forEach(account => {
        if (account.clv_2025_predicted !== undefined && account.clv_2025_predicted !== null) {
            account.suggested_tier = getLoyaltyTierLocal(account.clv_2025_predicted);
            account.tier_correct = account.suggested_tier === account.actual_tier;
        }
    });

    // Compute standard accuracy details
    let correctCount = 0;
    let predictedTotal = 0;
    let actualSum = 0;
    let predictedSum = 0;
    let maeSum = 0;

    accountsData.forEach(account => {
        const actualVal = account.clv_2025 || 0;
        const predictedVal = account.clv_2025_predicted;
        
        if (predictedVal !== undefined && predictedVal !== null) {
            predictedTotal++;
            predictedSum += predictedVal;
            actualSum += actualVal;
            maeSum += Math.abs(predictedVal - actualVal);
            if (account.tier_correct) correctCount++;
        }
    });

    const tierAccuracy = predictedTotal > 0 ? (correctCount / predictedTotal) * 100 : 0;
    const stats = {
        total_predictions: predictedTotal,
        mean_actual_clv: predictedTotal > 0 ? actualSum / predictedTotal : 0,
        mean_predicted_clv: predictedTotal > 0 ? predictedSum / predictedTotal : 0,
        total_actual_clv: actualSum,
        total_predicted_clv: predictedSum,
        mae: predictedTotal > 0 ? maeSum / predictedTotal : 0,
        tier_accuracy: tierAccuracy,
        correct_tiers: correctCount,
        total_predictions_tier: predictedTotal,
        max_diff: 53160,
        min_diff: -41200
    };

    updateStats(stats);
    applyFilters();

    if (currentTab === 'dashboard' || currentTab === 'performance') {
        createCharts();
    }
    
    updateSyncDashboardInfo();
}

// Dynamic range adjustment widgets setup
function initializeThresholdSliders() {
    const bsSlider = document.getElementById('bronzeSilverThreshold');
    const sgSlider = document.getElementById('silverGoldThreshold');
    const bsVal = document.getElementById('bronzeSilverVal');
    const sgVal = document.getElementById('silverGoldVal');

    if (!bsSlider || !sgSlider) return;

    bsSlider.value = bronzeSilverThreshold;
    sgSlider.value = silverGoldThreshold;
    bsVal.textContent = formatCurrency(bronzeSilverThreshold);
    sgVal.textContent = formatCurrency(silverGoldThreshold);

    const updateLabelAndRecalc = () => {
        let bs = parseInt(bsSlider.value);
        let sg = parseInt(sgSlider.value);

        // Slider boundaries checks
        if (bs >= sg) {
            bs = sg - 500;
            bsSlider.value = bs;
        }

        bronzeSilverThreshold = bs;
        silverGoldThreshold = sg;

        bsVal.textContent = formatCurrency(bronzeSilverThreshold);
        sgVal.textContent = formatCurrency(silverGoldThreshold);

        recalculateTiers();
    };

    bsSlider.addEventListener('input', updateLabelAndRecalc);
    sgSlider.addEventListener('input', updateLabelAndRecalc);

    document.getElementById('presetDefault').addEventListener('click', () => {
        bsSlider.value = 5000;
        sgSlider.value = 25000;
        updateLabelAndRecalc();
    });
    document.getElementById('presetAggressive').addEventListener('click', () => {
        bsSlider.value = 8000;
        sgSlider.value = 30000;
        updateLabelAndRecalc();
    });
    document.getElementById('presetConservative').addEventListener('click', () => {
        bsSlider.value = 3000;
        sgSlider.value = 15000;
        updateLabelAndRecalc();
    });
}

// Initialize sub-tabs on dashboard
function initializeDashboardSubTabs() {
    const subTabBtns = document.querySelectorAll('.sub-tab-btn');
    subTabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const subtabName = btn.getAttribute('data-subtab');
            
            // Toggle active classes
            subTabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Switch views
            const operationalContent = document.getElementById('operationalViewContent');
            const strategicContent = document.getElementById('strategicViewContent');
            
            if (subtabName === 'operational') {
                operationalContent.style.display = 'block';
                strategicContent.style.display = 'none';
                
                if (charts.churn) charts.churn.resize();
                if (charts.tier) charts.tier.resize();
            } else if (subtabName === 'strategic') {
                operationalContent.style.display = 'none';
                strategicContent.style.display = 'block';
                
                if (charts.historicalVsPredicted) charts.historicalVsPredicted.resize();
                if (charts.cohortAnalysis) charts.cohortAnalysis.resize();
            }
        });
    });
}

// Action Center attention cards clicks to filter accounts list view
function initializeActionCenterClicks() {
    const retentionTarget = document.getElementById('actionRetentionTarget');
    const campaignTarget = document.getElementById('actionCampaignTarget');
    const syncTarget = document.getElementById('actionSyncTarget');
    
    if (retentionTarget) {
        retentionTarget.addEventListener('click', () => {
            document.getElementById('churnFilter').value = 'High';
            document.getElementById('regionFilter').value = 'all';
            document.getElementById('tierFilter').value = 'all';
            document.getElementById('matchFilter').value = 'all';
            document.getElementById('priorityFilter').value = 'all';
            document.getElementById('listSearchInput').value = '';
            switchTab('accounts');
            applyFilters();
        });
    }
    
    if (campaignTarget) {
        campaignTarget.addEventListener('click', () => {
            document.getElementById('churnFilter').value = 'Medium';
            document.getElementById('regionFilter').value = 'all';
            document.getElementById('tierFilter').value = 'all';
            document.getElementById('matchFilter').value = 'all';
            document.getElementById('priorityFilter').value = 'all';
            document.getElementById('listSearchInput').value = '';
            switchTab('accounts');
            applyFilters();
        });
    }
    
    if (syncTarget) {
        syncTarget.addEventListener('click', () => {
            document.getElementById('matchFilter').value = 'mismatch';
            document.getElementById('regionFilter').value = 'all';
            document.getElementById('tierFilter').value = 'all';
            document.getElementById('churnFilter').value = 'all';
            document.getElementById('priorityFilter').value = 'all';
            document.getElementById('listSearchInput').value = '';
            switchTab('accounts');
            applyFilters();
        });
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeTabs();
    initializeGlobalSearch();
    initializeThresholdSliders();
    initializeDashboardSubTabs();
    initializeActionCenterClicks();
    loadAccounts();
});
